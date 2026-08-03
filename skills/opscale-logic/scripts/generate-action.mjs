#!/usr/bin/env node
// Deterministic generator for a single Opscale Action class.
//
// Input JSON shape:
//   {
//     "action_class_name": "CalculateInterest",
//     "identifier":        "calculate-interest",
//     "name":              "Calculate Interest",
//     "description":       "Computes interest for a loan over a date range.",
//     "package_namespace": "Opscale\\LoanModule",
//     "output_dir":        "src/Services/Actions",
//     "parameters": [
//       {
//         "name":        "loan",
//         "description": "The loan to calculate interest for.",
//         "type":        "Loan",           // PHP class (resolved against entities) or scalar: string|int|bool|array
//         "rules":       ["required"]
//       },
//       {
//         "name":        "from",
//         "description": "Start date.",
//         "type":        "string",
//         "rules":       ["required", "date"]
//       }
//     ],
//     "entities":     ["Loan"],            // models referenced as parameter types or in handle()
//     "dependencies": ["GetExchangeRate"], // other Actions composed via ::run()
//
//     // SIPOC Outputs — REQUIRED (outputs() is abstract in opscale-co/actions ^2.2).
//     // Same shape as parameters; handle()'s success payload is validated against it.
//     "outputs": [
//       { "name": "interest", "description": "Computed interest.", "type": "string", "rules": ["required", "string"] }
//     ],
//
//     // SIPOC Supplier = system (optional): name of the model parameter that
//     // arrives as the Nova-selected record. Generates a prefill() closure
//     // (fn ($ctx) => $ctx?->models?->first()) plus a private resolver that
//     // accepts instance | Collection (Nova extras) | id (API/CLI/MCP).
//     "entity_param": "loan",
//
//     // SIPOC pre-P gate (optional): raw PHP body for canRun(array $inputs).
//     // Return true to run, or a reason string to soft-fail. State
//     // preconditions from the SIPOC ("only from status X") belong here.
//     "can_run_body": "$loan = $this->loan($inputs);\nif (! $loan instanceof Loan) {\n    return 'Loan not found.';\n}\n\nreturn true;",
//
//     // Choice lists (optional): rendered as Select (Nova), enum (MCP),
//     // choice() (CLI). php_expr is a raw PHP expression.
//     "options_entries": [
//       { "param": "status", "php_expr": "array_column(LoanStatus::cases(), 'name', 'value')" }
//     ],
//
//     // SIPOC Client = system (optional, default false): adds `use EmitsEvent;`
//     // so the pipeline dispatches event("{identifier}", [$outputs]) after
//     // every success. Set true when the SIPOC declares an output/notification.
//     "emits_event": true,
//
//     // handle(array $inputs) receives VALIDATED inputs — no fill()/validate()/get().
//     // Success: return $this->succeed([...outputs...]); soft-fail: return
//     // $this->fail('reason'); hard-fail: throw.
//     "handle_body":  "$loan = $this->loan($inputs);\nif (! $loan instanceof Loan) {\n    return $this->fail('Loan not found.');\n}\n$rate = GetExchangeRate::run(['date' => $inputs['from']]);\n\nreturn $this->succeed(['interest' => (string) ($loan->principal * $rate)]);",
//
//     // Nova registration (optional — when present, generator registers the
//     // Action in the target Resource's actions() method per SKILL.md +
//     // references/canSee-patterns.md).
//     "nova_registration": {
//       "target_resource":  "Application",                  // Resource class to register on
//       "resource_dir":     "src/Nova",                     // optional — defaults to <output_dir>/../../Nova
//       "status_property":  "status",                       // optional — default "status"
//       "state_enum":       "ApplicationStatus",            // PHP enum class for the state precondition
//       "allowed_states":   ["PendingReview"]               // empty / omitted → no canSee guard
//     },
//
//     "lang_dir": "lang",     // optional — defaults to <project_root>/lang (derived from output_dir)
//     "locale":   "en"        // optional — default locale to seed; defaults to "en"
//   }
//
// The handle_body is inserted verbatim after `$this->fill` + `$this->validate`.
// The script indents multi-line bodies appropriately.
//
// Translation seeding: the script also appends `{name}: {name}` to
// `{lang_dir}/{locale}.json` so the Action's `__('{name}')` call has a key
// to translate. The English value is the placeholder — the human translator
// (or laravel-lang/common) replaces it later. The file is created (as `{}`)
// if missing. Only `name()` is translated; `description()` carries operative
// / LLM context, not UI strings.

import { dirname, join, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readJsonInput, render, writeOrConflict, loadTemplate, resultLine } from './_lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SCALAR_TYPES = new Set(['string', 'int', 'integer', 'bool', 'boolean', 'array', 'mixed', 'float']);

function paramTypeExpr(type) {
  if (SCALAR_TYPES.has(type)) return `'${type}'`;
  return `${type}::class`;
}

function rulesPhp(rules) {
  return (rules || []).map(r => `'${r}'`).join(', ');
}

function indentBody(body, spaces) {
  const pad = ' '.repeat(spaces);
  return body.split('\n').map((line, i) => i === 0 ? line : (line ? pad + line : line)).join('\n');
}

function escapeSingle(s) { return String(s).replace(/'/g, "\\'"); }

// ---------------------------------------------------------------------------
// Nova registration helpers — splice the Action into the target Resource's
// actions() method, with the right canSee guard for the SIPOC precondition.
// ---------------------------------------------------------------------------

function buildCanSeeClause(stateEnum, allowedStates, statusProperty = 'status') {
  if (!stateEnum || !Array.isArray(allowedStates) || allowedStates.length === 0) return '';
  if (allowedStates.length === 1) {
    return `->canSee(fn ($request) => $request->findModel()?->${statusProperty}?->is(${stateEnum}::${allowedStates[0]}))`;
  }
  const list = allowedStates.map(s => `${stateEnum}::${s}`).join(', ');
  return `->canSee(fn ($request) => in_array($request->findModel()?->${statusProperty}, [${list}], strict: true))`;
}

function buildRegistrationLine(actionClassName, canSeeClause) {
  // Always indent to 12 spaces — matches the `return [` block inside actions().
  return canSeeClause
    ? `            ${actionClassName}::make()\n                ${canSeeClause},`
    : `            ${actionClassName}::make(),`;
}

function ensureActionUse(resourceSrc, fullyQualified) {
  // Insert `use {fullyQualified};` once. Place alphabetically after the last
  // existing use statement so the imports stay sorted-ish.
  const useLine = `use ${fullyQualified};`;
  if (resourceSrc.includes(useLine)) return resourceSrc;
  const lines = resourceSrc.split('\n');
  let lastUseIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^use\s+[^;]+;/.test(lines[i])) lastUseIdx = i;
  }
  if (lastUseIdx === -1) return resourceSrc; // no use block — bail
  lines.splice(lastUseIdx + 1, 0, useLine);
  return lines.join('\n');
}

function injectIntoActionsMethod(resourceSrc, registrationLine) {
  // Find an existing actions() method. If it exists with `return [];`, replace
  // it with `return [\n{registrationLine}\n        ];`. If it exists with
  // entries, splice before the closing `];`. If it does not exist, append a
  // new actions() method before the final class-closing `}`.
  const idempotencyMarker = registrationLine.split('\n')[0].trim();
  if (resourceSrc.includes(idempotencyMarker)) return { src: resourceSrc, action: 'SKIPPED' };

  const actionsMethodRe = /public function actions\(NovaRequest \$request\): array\s*\{\s*return \[([\s\S]*?)\];\s*\}/m;
  const m = resourceSrc.match(actionsMethodRe);

  if (m) {
    const innerBody = m[1].trimEnd();
    const newInner = innerBody.length === 0
      ? `\n${registrationLine}\n        `
      : `${innerBody}\n${registrationLine}\n        `;
    const replacement = `public function actions(NovaRequest $request): array\n    {\n        return [${newInner}];\n    }`;
    return { src: resourceSrc.replace(actionsMethodRe, replacement), action: 'INJECTED' };
  }

  // No actions() method yet — append one right before the final '}'.
  const lastBraceIdx = resourceSrc.lastIndexOf('}');
  if (lastBraceIdx === -1) return { src: resourceSrc, action: 'SKIPPED' };
  const head = resourceSrc.slice(0, lastBraceIdx).trimEnd();
  const tail = resourceSrc.slice(lastBraceIdx);
  const method = `\n\n    public function actions(NovaRequest $request): array\n    {\n        return [\n${registrationLine}\n        ];\n    }\n`;
  return { src: head + method + tail, action: 'ADDED' };
}

function registerOnResource(input, actionClassName) {
  const reg = input.nova_registration;
  if (!reg || !reg.target_resource) return { action: 'SKIPPED', reason: 'no nova_registration' };

  const resourceDir = reg.resource_dir
    ? resolve(reg.resource_dir)
    : resolve(input.output_dir, '..', '..', 'Nova');
  const resourcePath = join(resourceDir, `${reg.target_resource}.php`);
  if (!existsSync(resourcePath)) {
    return { action: 'SKIPPED', reason: `target resource not found at ${resourcePath}` };
  }

  let src = readFileSync(resourcePath, 'utf8');
  src = ensureActionUse(src, `${input.package_namespace}\\Services\\Actions\\${actionClassName}`);

  const canSeeClause = buildCanSeeClause(
    reg.state_enum,
    reg.allowed_states || [],
    reg.status_property || 'status',
  );

  // Also import the State enum + ensure NovaRequest import already present.
  if (reg.state_enum) {
    src = ensureActionUse(src, `${input.package_namespace}\\Models\\Enums\\${reg.state_enum}`);
  }
  if (!src.includes('use Laravel\\Nova\\Http\\Requests\\NovaRequest;')) {
    src = ensureActionUse(src, 'Laravel\\Nova\\Http\\Requests\\NovaRequest');
  }

  const registrationLine = buildRegistrationLine(actionClassName, canSeeClause);
  const result = injectIntoActionsMethod(src, registrationLine);

  if (result.action === 'SKIPPED') return { action: 'SKIPPED', reason: 'already registered', path: resourcePath };

  writeFileSync(resourcePath, result.src);
  return {
    action: result.action,
    path: resourcePath,
    canSee: canSeeClause ? 'yes' : 'no',
  };
}

// Resolve the project's lang/ directory. If the caller passes one, honor it.
// Otherwise derive from output_dir by walking up to the project root: a typical
// output_dir is `<project>/src/Services/Actions`, so two levels up is `<project>/src`
// and three levels up is `<project>/`.
function resolveLangDir(input) {
  if (input.lang_dir) return resolve(input.lang_dir);
  return resolve(input.output_dir, '..', '..', '..', 'lang');
}

// Append `{key}: {value}` to lang/{locale}.json without clobbering existing
// translations. Creates the file (and parent directories) as `{}` if missing,
// and is a no-op if the key is already present (idempotent across reruns).
function seedTranslation(langDir, locale, key, value) {
  const filePath = join(langDir, `${locale}.json`);
  let json = {};
  if (existsSync(filePath)) {
    try { json = JSON.parse(readFileSync(filePath, 'utf8')); }
    catch (_) { json = {}; }
    if (Object.prototype.hasOwnProperty.call(json, key)) {
      return { path: filePath, action: 'SKIPPED', key };
    }
  } else {
    mkdirSync(langDir, { recursive: true });
  }
  json[key] = value;
  writeFileSync(filePath, JSON.stringify(json, null, 4) + '\n');
  return { path: filePath, action: 'SEEDED', key };
}

function camelCase(snake) {
  return snake.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function main() {
  const input = readJsonInput();
  for (const k of ['action_class_name', 'identifier', 'name', 'description', 'package_namespace', 'output_dir', 'handle_body', 'outputs']) {
    if (input[k] === undefined) throw new Error(`Missing required field: ${k}`);
  }

  const entity_imports     = (input.entities     || []).map(e => `${input.package_namespace}\\Models\\${e}`).sort();
  const dependency_imports = (input.dependencies || []).map(d => `${input.package_namespace}\\Services\\Actions\\${d}`).sort();

  const mapSchemaRows = rows => (rows || []).map(p => ({
    name:        p.name,
    description: escapeSingle(p.description || ''),
    type_expr:   paramTypeExpr(p.type),
    rules:       rulesPhp(p.rules),
  }));

  const parameters = mapSchemaRows(input.parameters);
  const outputs = mapSchemaRows(input.outputs);

  // entity_param → prefill closure + private resolver (instance | Collection | id)
  let entity_class = null, entity_var = null, entity_resolver_name = null;
  if (input.entity_param) {
    const entityRow = (input.parameters || []).find(p => p.name === input.entity_param);
    if (!entityRow || SCALAR_TYPES.has(entityRow.type)) {
      throw new Error(`entity_param '${input.entity_param}' must match a model-typed parameter`);
    }
    entity_class = entityRow.type;
    entity_var = camelCase(input.entity_param);
    entity_resolver_name = entity_var;
  }

  const context = {
    package_namespace: input.package_namespace,
    action_class_name: input.action_class_name,
    identifier:        escapeSingle(input.identifier),
    name:              escapeSingle(input.name),
    description:       escapeSingle(input.description),
    parameters,
    outputs,
    entity_imports,
    dependency_imports,
    emits_event:       Boolean(input.emits_event),
    entity_param:      input.entity_param || null,
    entity_class,
    entity_var,
    entity_resolver_name,
    options_entries:   (input.options_entries || []).map(o => ({ param: o.param, php_expr: o.php_expr })),
    can_run_body:      input.can_run_body ? indentBody(input.can_run_body, 8) : null,
    handle_body:       indentBody(input.handle_body, 8),
  };

  const template = loadTemplate(join(__dirname, '..', 'templates', 'action.php.tmpl'));
  const rendered = render(template, context);
  const outPath = resolve(input.output_dir, `${input.action_class_name}.php`);
  const result = writeOrConflict(outPath, rendered);

  const langDir = resolveLangDir(input);
  const locale  = input.locale || 'en';
  const langResult = seedTranslation(langDir, locale, input.name, input.name);

  const regResult = registerOnResource(input, input.action_class_name);

  console.log(resultLine('STATUS', result.status));
  console.log(resultLine('GENERATED', result.path));
  if (result.preview) console.log(resultLine('PREVIEW', result.preview));
  console.log(resultLine('ACTION', input.action_class_name));
  console.log(resultLine('IDENTIFIER', input.identifier));
  console.log(resultLine('PARAMETERS', parameters.length));
  console.log(resultLine('DEPENDENCIES', (input.dependencies || []).join(',') || 'none'));
  console.log(resultLine('LANG_STATUS', langResult.action));
  console.log(resultLine('LANG_PATH',   langResult.path));
  console.log(resultLine('LANG_KEY',    langResult.key));
  console.log(resultLine('NOVA_REGISTRATION', regResult.action));
  if (regResult.path)   console.log(resultLine('NOVA_REGISTRATION_PATH', regResult.path));
  if (regResult.canSee) console.log(resultLine('NOVA_CAN_SEE', regResult.canSee));
  if (regResult.reason) console.log(resultLine('NOVA_REGISTRATION_REASON', regResult.reason));
}

try { main(); } catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}
