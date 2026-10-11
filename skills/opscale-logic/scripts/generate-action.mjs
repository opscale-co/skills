#!/usr/bin/env node
// Deterministic ASSEMBLER for a single Opscale Action class.
//
// A fleet of single-concern section agents (action-identifier-generator,
// action-parameters-generator, action-outputs-generator,
// action-translations-generator) each read their SIPOC/dbml slice and return a
// STRUCTURED JSON contribution; the opscale-logic skill merges them (plus the
// handle()/canRun() bodies authored by the action-generator flow) into the one
// input below and this script renders the class. It never authors business
// logic — it indents the supplied bodies verbatim.
//
// Input JSON shape:
//   {
//     "action_class_name": "ApproveQuote",
//     "prefix":            "ventas",            // MODULE_PREFIX (constitution)
//     "identifier":        "approve-quote",     // kebab SIPOC id (the slug)
//                                               //   final identifier() = "{prefix}.{identifier}"
//                                               //   = "ventas.approve-quote"
//     "name":              "Approve quote",     // EN fallback for the name key
//     "description":       "Approves a quote.",  // EN fallback for the desc key
//     "package_namespace": "Opscale\\Ventas",
//     "output_dir":        "src/Services/Actions",
//     "parameters": [
//       {
//         "name":        "quote",
//         "description": "The quote to approve.",  // EN fallback for the param key
//         "type":        "Quote",          // PHP class (resolved against entities) or scalar: string|int|bool|array
//         "rules":       ["required"]
//       },
//       {
//         "name":            "approver",
//         "description":     "Approving manager (host user).",
//         "type":            "string",
//         "rules":           ["required", "string"],
//         "requires_options": true         // option/relation/id param → MUST carry an
//                                           //   options_entries entry OR an exists:/in: rule;
//                                           //   a bare Text/free string FAILS generation.
//       }
//     ],
//     "entities":     ["Quote"],            // models referenced as parameter types or in handle()
//     "dependencies": ["VersionQuote"],     // other Actions composed via ::run()
//
//     // SIPOC Outputs — REQUIRED (outputs() is abstract in opscale-co/actions ^2.2).
//     "outputs": [
//       { "name": "quote", "description": "The approved quote.", "type": "Quote", "rules": ["required"] }
//     ],
//
//     // SIPOC Process (optional) — the composed ops of the BPMN logic operation,
//     // each with its crud `action`. Generation FAILS if any action is "create":
//     // an Action never creates a record (that is a Nova create form / CRUD).
//     "process": [
//       { "operation": "SP-02-02-L01-C01", "action": "read" },
//       { "operation": "SP-02-02-L01-C02", "action": "update" }
//     ],
//
//     // SIPOC Supplier = system (optional): name of the model parameter that
//     // arrives as the Nova-selected record. Generates a prefill() closure
//     // (fn ($ctx) => $ctx?->models?->first()) plus a private resolver that
//     // accepts instance | Collection (Nova extras) | id (API/CLI/MCP). EXEMPT
//     // from requires_options (it is a prefilled model, not a free Text field).
//     "entity_param": "quote",
//
//     // SIPOC pre-P gate (optional): raw PHP body for canRun(array $inputs).
//     // Messages wrapped in __('{prefix}.{identifier}.fail.{n}') — seed the
//     // values via translations.fail.
//     "can_run_body": "$quote = $this->quote($inputs);\nif (! $quote instanceof Quote) {\n    return __('ventas.approve-quote.fail.not_found');\n}\n\nreturn true;",
//
//     // Choice lists (optional): rendered as Select (Nova), enum (MCP),
//     // choice() (CLI). php_expr is a raw PHP expression. A param flagged
//     // requires_options is satisfied by an entry here.
//     "options_entries": [
//       { "param": "approver", "php_expr": "resolve(UsersContract::class)->options()" }
//     ],
//
//     // SIPOC Client = system (optional, default false): adds `use EmitsEvent;`
//     // so the pipeline dispatches event("{identifier}", [$outputs]) after success.
//     "emits_event": true,
//
//     // handle(array $inputs) — VALIDATED inputs; messages wrapped in __() keys.
//     "handle_body":  "$quote = $this->quote($inputs);\n\nreturn $this->succeed(['quote' => $quote->fresh()]);",
//
//     // i18n contribution (optional overrides). The script OWNS the key scheme —
//     // keys are namespaced {prefix}.{identifier}.{name|desc|param.<p>|output.<o>|fail.<n>}
//     // and seeded into BOTH lang/en.json AND lang/es.json. The EN/ES values come
//     // from here; where absent the script falls back to the English string above
//     // (name / description / param.description / output.description). fail.* keys
//     // have no fallback — they come only from here (the bodies reference them).
//     "translations": {
//       "name":   { "en": "Approve quote",       "es": "Aprobar la propuesta" },
//       "desc":   { "en": "Approves a quote.",    "es": "Aprueba la propuesta." },
//       "param":  { "quote": { "en": "Quote to approve.", "es": "Propuesta a aprobar." } },
//       "output": { "quote": { "en": "Approved quote.",   "es": "Propuesta aprobada." } },
//       "fail":   { "not_found": { "en": "Quote not found.", "es": "La propuesta no existe." } }
//     },
//
//     // Nova registration (optional back-compat — opscale-logic NEVER passes it;
//     // opscale-ui does the actions()/canSee wiring. Retained so a standalone
//     // caller that wants it still works).
//     "nova_registration": { "target_resource": "Quote", "state_enum": "QuoteStatus", "allowed_states": ["Draft"] },
//
//     "lang_dir": "lang"      // optional — defaults to <project_root>/lang (derived from output_dir)
//   }
//
// The handle_body / can_run_body are inserted verbatim (indented). The script
// handles the identifier prefix, the namespaced i18n keys, the dual-locale
// seeding, the option/relation/id enforcement, and the no-create assertion.

import { dirname, join, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readJsonInput, render, writeOrConflict, loadTemplate, resultLine, seedTranslations } from './_lib.mjs';

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

function camelCase(snake) {
  return snake.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function main() {
  const input = readJsonInput();
  for (const k of ['action_class_name', 'identifier', 'name', 'description', 'package_namespace', 'output_dir', 'handle_body', 'outputs']) {
    if (input[k] === undefined) throw new Error(`Missing required field: ${k}`);
  }

  // --- Identifier: {prefix}.{slug} ----------------------------------------
  // identifier() is also the system-event name; the prefix namespaces events
  // per module. If the slug already carries a dot it is treated as pre-prefixed.
  const slug           = String(input.identifier);
  const prefix         = input.prefix ? String(input.prefix) : null;
  const fullIdentifier = (prefix && !slug.includes('.')) ? `${prefix}.${slug}` : slug;
  // keyBase namespaces every __() key for this Action.
  const keyBase = fullIdentifier;

  // --- No-create assertion -------------------------------------------------
  // An Action never creates a record (record creation is a Nova create form /
  // CRUD). The upstream no-create-in-logic BPMN rule already guarantees this;
  // we assert it here so a malformed plan fails loudly at generation.
  const createOps = (input.process || []).filter(s => String(s.action || s.crud || '').toLowerCase() === 'create');
  if (createOps.length > 0) {
    const codes = createOps.map(s => s.operation || s.code || '?').join(', ');
    throw new Error(`process[] contains a 'create' operation (${codes}) — an Action never creates a record; record creation is a Nova create form (CRUD), not an Action.`);
  }

  // --- Option/relation/id enforcement -------------------------------------
  // A parameter flagged requires_options (its SIPOC input is an enum, a
  // relation, or an identifier the user picks) must ship an options() source
  // or an exists:/in: rule. A bare Text/free string is forbidden — this is the
  // ApproveQuote.approver bug class.
  for (const p of (input.parameters || [])) {
    if (!p.requires_options) continue;
    const hasOptions = (input.options_entries || []).some(o => o.param === p.name);
    const hasExists  = (p.rules || []).some(r => /^(exists|in):/i.test(String(r)));
    if (!hasOptions && !hasExists) {
      throw new Error(`parameter '${p.name}' is an option/relation/id input and must ship options()/exists: — a bare Text/free string is forbidden (fixes the ApproveQuote.approver free-Text case).`);
    }
  }

  const entity_imports     = (input.entities     || []).map(e => `${input.package_namespace}\\Models\\${e}`).sort();
  const dependency_imports = (input.dependencies || []).map(d => `${input.package_namespace}\\Services\\Actions\\${d}`).sort();

  // Each param/output carries a namespaced i18n KEY for its description; the
  // technical `name` stays untranslated (it is the input/output array key).
  const parameters = (input.parameters || []).map(p => ({
    name:            p.name,
    description_key: `${keyBase}.param.${p.name}`,
    type_expr:       paramTypeExpr(p.type),
    rules:           rulesPhp(p.rules),
  }));
  const outputs = (input.outputs || []).map(o => ({
    name:            o.name,
    description_key: `${keyBase}.output.${o.name}`,
    type_expr:       paramTypeExpr(o.type),
    rules:           rulesPhp(o.rules),
  }));

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

  const name_key        = `${keyBase}.name`;
  const description_key = `${keyBase}.desc`;

  const context = {
    package_namespace: input.package_namespace,
    action_class_name: input.action_class_name,
    identifier:        escapeSingle(fullIdentifier),
    name_key:          escapeSingle(name_key),
    description_key:   escapeSingle(description_key),
    description:       escapeSingle(input.description),   // docblock only
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

  // --- i18n: build the key→{en,es} map, seed BOTH locales ------------------
  // The script owns the key scheme; values come from `translations`, falling
  // back to the English strings above (fail.* keys come only from translations).
  const tr = input.translations || {};
  const enEntries = new Map();
  const esEntries = new Map();
  const add = (key, en, es) => {
    if (!key) return;
    const enVal = en != null ? en : key;
    const esVal = es != null ? es : (en != null ? en : key);
    if (!enEntries.has(key)) enEntries.set(key, enVal);
    if (!esEntries.has(key)) esEntries.set(key, esVal);
  };

  add(name_key,        (tr.name || {}).en ?? input.name,        (tr.name || {}).es);
  add(description_key, (tr.desc || {}).en ?? input.description, (tr.desc || {}).es);
  for (const p of (input.parameters || [])) {
    const v = (tr.param || {})[p.name] || {};
    add(`${keyBase}.param.${p.name}`, v.en ?? p.description ?? p.name, v.es);
  }
  for (const o of (input.outputs || [])) {
    const v = (tr.output || {})[o.name] || {};
    add(`${keyBase}.output.${o.name}`, v.en ?? o.description ?? o.name, v.es);
  }
  for (const [n, v] of Object.entries(tr.fail || {})) {
    add(`${keyBase}.fail.${n}`, (v || {}).en, (v || {}).es);
  }
  // Arbitrary extra message keys (already fully namespaced).
  for (const [k, v] of Object.entries(tr.message || {})) {
    add(k, (v || {}).en, (v || {}).es);
  }

  const langDir  = resolveLangDir(input);
  const enResult = seedTranslations(langDir, 'en', enEntries);
  const esResult = seedTranslations(langDir, 'es', esEntries);

  const regResult = registerOnResource(input, input.action_class_name);

  console.log(resultLine('STATUS', result.status));
  console.log(resultLine('GENERATED', result.path));
  if (result.preview) console.log(resultLine('PREVIEW', result.preview));
  console.log(resultLine('ACTION', input.action_class_name));
  console.log(resultLine('IDENTIFIER', fullIdentifier));
  console.log(resultLine('PARAMETERS', parameters.length));
  console.log(resultLine('DEPENDENCIES', (input.dependencies || []).join(',') || 'none'));
  console.log(resultLine('LANG_EN_PATH',  enResult.path));
  console.log(resultLine('LANG_EN_ADDED', enResult.added.length));
  console.log(resultLine('LANG_ES_PATH',  esResult.path));
  console.log(resultLine('LANG_ES_ADDED', esResult.added.length));
  console.log(resultLine('NOVA_REGISTRATION', regResult.action));
  if (regResult.path)   console.log(resultLine('NOVA_REGISTRATION_PATH', regResult.path));
  if (regResult.canSee) console.log(resultLine('NOVA_CAN_SEE', regResult.canSee));
  if (regResult.reason) console.log(resultLine('NOVA_REGISTRATION_REASON', regResult.reason));
}

try { main(); } catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}
