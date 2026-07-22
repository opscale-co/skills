#!/usr/bin/env node
// Deterministic generator for a Nova field trait ({ModelName}Fields).
//
// Input JSON shape:
//   {
//     "model_name":        "Order",
//     "package_namespace": "Opscale\\LoanModule",
//     "output_dir":        "src/Nova/Concerns",
//     "fields": [
//       {
//         "field":     "Text",                 // Nova field class
//         "label":     "Code",                 // EN — required
//         "label_es":  "Código",               // ES — required (EN-only seeding is no longer accepted)
//         "attribute": "code",
//         "modifiers": [
//           "sortable",
//           { "rules": "code" }                 // → ->rules(...Order::$validationRules['code'])
//         ]
//       },
//       {
//         "field":      "Select",
//         "label":      "Type",
//         "label_es":   "Tipo",
//         "attribute":  "type",
//         "enum_class": "OrderType",            // required when field=Select with enum options
//         "modifiers":  ["filterable", "displayUsingLabels", { "rules": "type" }]
//       },
//       {
//         "field":             "BelongsTo",
//         "label":             "Customer",
//         "label_es":          "Cliente",
//         "attribute":         "customer",
//         "related_resource":  "Customer",
//         "modifiers": ["searchable", { "rules": "customer_id" }]
//       },
//       {
//         "field":          "VirtualSelect",   // cross-subdomain logical ref — see references/virtual-relations.md
//         "label":          "Counterparty",
//         "label_es":       "Contraparte",
//         "attribute":      "counterparty_id",
//         "contract_class": "CounterpartyContract",
//         "modifiers":      ["searchable", "filterable", "displayUsingLabels"]
//       },
//       {
//         "field":     "Boolean",
//         "label":     "Is Active",
//         "label_es":  "Activo",
//         "attribute": "is_active",
//         "modifiers": ["sortable"]
//       },
//       {
//         "field":     "Number",
//         "label":     "Amount",
//         "label_es":  "Monto",
//         "attribute": "amount",
//         "modifiers": ["sortable", { "rules": "amount" }]
//       }
//     ],
//
//     "lang_dir": "lang"      // optional — defaults to <project_root>/lang (derived from output_dir)
//   }
//
// Output: writes `{output_dir}/{ModelName}Fields.php` and seeds every field
// label + every `{ help: '...' }` modifier into BOTH `{lang_dir}/en.json`
// AND `{lang_dir}/es.json` (created if missing; existing keys preserved).
// EN-only seeding is no longer accepted — every label MUST carry a `label_es`.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonInput, render, writeOrConflict, loadTemplate, resultLine, seedTranslations } from './_lib.mjs';

function resolveLangDir(input) {
  if (input.lang_dir) return resolve(input.lang_dir);
  // output_dir is typically <project>/src/Nova/Concerns → three levels up is <project>.
  return resolve(input.output_dir, '..', '..', '..', 'lang');
}

const __dirname = dirname(fileURLToPath(import.meta.url));

const FIELD_NAMESPACE = {
  Text:          'Laravel\\Nova\\Fields\\Text',
  Textarea:      'Laravel\\Nova\\Fields\\Textarea',
  Trix:          'Laravel\\Nova\\Fields\\Trix',
  Number:        'Laravel\\Nova\\Fields\\Number',
  Boolean:       'Laravel\\Nova\\Fields\\Boolean',
  Select:        'Laravel\\Nova\\Fields\\Select',
  // VirtualSelect is a cross-subdomain logical-ref Select (see
  // references/virtual-relations.md). It renders Nova's Select with options
  // sourced from a contract registered in the host app — never Text + help.
  VirtualSelect: 'Laravel\\Nova\\Fields\\Select',
  BelongsTo:     'Laravel\\Nova\\Fields\\BelongsTo',
  MorphTo:       'Laravel\\Nova\\Fields\\MorphTo',
  Date:          'Laravel\\Nova\\Fields\\Date',
  DateTime:      'Laravel\\Nova\\Fields\\DateTime',
  Currency:      'Laravel\\Nova\\Fields\\Currency',
  Email:         'Laravel\\Nova\\Fields\\Email',
  Password:      'Laravel\\Nova\\Fields\\Password',
  File:          'Laravel\\Nova\\Fields\\File',
  Image:         'Laravel\\Nova\\Fields\\Image',
  Slug:          'Laravel\\Nova\\Fields\\Slug',
};

function fieldHead(f, modelName) {
  switch (f.field) {
    case 'BelongsTo':
      return `BelongsTo::make(__('${f.label}'), '${f.attribute}', ${f.related_resource}::class)`;
    case 'MorphTo':
      return `MorphTo::make(__('${f.label}'), '${f.attribute}')`;
    case 'Select':
      return [
        `Select::make(__('${f.label}'), '${f.attribute}')`,
        `    ->options(`,
        `        collect(${f.enum_class}::cases())`,
        `            ->mapWithKeys(fn ($case) => [$case->value => __($case->name)])`,
        `            ->all()`,
        `    )`,
      ].join('\n            ');
    case 'VirtualSelect':
      // Cross-subdomain logical ref. The Select pulls its options from a
      // contract bound by the host application — the contract MUST expose
      // forSelect(): array.
      return [
        `Select::make(__('${f.label}'), '${f.attribute}')`,
        `    ->options(fn () => app(${f.contract_class}::class)->forSelect())`,
      ].join('\n            ');
    default:
      return `${f.field}::make(__('${f.label}'), '${f.attribute}')`;
  }
}

function renderModifiers(modifiers, modelName) {
  return (modifiers || []).map(m => {
    if (typeof m === 'string') return `->${m}()`;
    if (m.rules)               return `->rules(...${modelName}Model::$validationRules['${m.rules}'])`;
    if (m.help)                return `->help(__('${m.help}'))`;
    if (m.default !== undefined) {
      const v = typeof m.default === 'string' ? `'${m.default}'` : m.default;
      return `->default(${v})`;
    }
    if (m.hideWhenCreating)    return `->hideWhenCreating()`;
    if (m.hideFromIndex)       return `->hideFromIndex()`;
    throw new Error(`Unknown modifier: ${JSON.stringify(m)}`);
  });
}

function renderFieldBlock(f, modelName) {
  if (!FIELD_NAMESPACE[f.field]) throw new Error(`Unknown Nova field: ${f.field}`);
  const head  = fieldHead(f, modelName);
  const mods  = renderModifiers(f.modifiers, modelName);
  if (mods.length === 0) return head;
  return [head, ...mods].join('\n                ');
}

function main() {
  const input = readJsonInput();
  for (const k of ['model_name', 'package_namespace', 'output_dir', 'fields']) {
    if (!input[k]) throw new Error(`Missing required field: ${k}`);
  }

  const fieldClassSet = new Set();
  const enumSet       = new Set();
  const relResSet     = new Set();
  const contractSet   = new Set();

  // Normalize labels: every field needs a label_es. EN-only is rejected so
  // ES translations don't silently end up as the English placeholder.
  for (const f of input.fields) {
    if (!FIELD_NAMESPACE[f.field]) throw new Error(`Unsupported Nova field: ${f.field}`);
    if (!f.label)    throw new Error(`Field for attribute '${f.attribute}' is missing label`);
    if (!f.label_es) throw new Error(`Field for attribute '${f.attribute}' is missing label_es (Spanish label)`);
    fieldClassSet.add(FIELD_NAMESPACE[f.field]);
    if (f.field === 'Select' && f.enum_class) enumSet.add(f.enum_class);
    if (f.field === 'VirtualSelect') {
      if (!f.contract_class) {
        throw new Error(`VirtualSelect field for attribute '${f.attribute}' is missing contract_class`);
      }
      contractSet.add(f.contract_class);
    }
    if ((f.field === 'BelongsTo' || f.field === 'MorphTo') && f.related_resource) relResSet.add(f.related_resource);
  }

  const imports                  = [...fieldClassSet].sort();
  const enum_imports             = [...enumSet].sort().map(e => `${input.package_namespace}\\Models\\Enums\\${e}`);
  const related_resource_imports = [...relResSet].sort().map(r => `${input.package_namespace}\\Nova\\${r}`);
  const contract_imports         = [...contractSet].sort().map(c => `${input.package_namespace}\\Contracts\\${c}`);

  const field_blocks = input.fields.map(f => renderFieldBlock(f, input.model_name));

  const context = {
    package_namespace: input.package_namespace,
    model_name:        input.model_name,
    imports,
    enum_imports,
    related_resource_imports,
    contract_imports,
    field_blocks,
  };

  const template = loadTemplate(join(__dirname, '..', 'templates', 'field-trait.php.tmpl'));
  const rendered = render(template, context);
  const outPath = resolve(input.output_dir, `${input.model_name}Fields.php`);
  const result = writeOrConflict(outPath, rendered);

  // Build per-locale translation maps. Key is the English string emitted
  // inside __(); value is the locale's translation. Help strings without an
  // ES counterpart fall back to the EN copy (so the key still exists in es.json
  // for a translator to fill — the alternative is a missing key).
  const enEntries = new Map();
  const esEntries = new Map();
  function add(en, es) {
    if (!en) return;
    if (!enEntries.has(en)) enEntries.set(en, en);
    if (!esEntries.has(en)) esEntries.set(en, es || en);
  }
  for (const f of input.fields) {
    add(f.label, f.label_es);
    for (const m of (f.modifiers || [])) {
      if (typeof m === 'object' && m && m.help) {
        add(m.help, m.help_es || m.help);
      }
    }
  }

  const langDir = resolveLangDir(input);
  const enResult = seedTranslations(langDir, 'en', enEntries);
  const esResult = seedTranslations(langDir, 'es', esEntries);

  console.log(resultLine('STATUS', result.status));
  console.log(resultLine('GENERATED', result.path));
  if (result.preview) console.log(resultLine('PREVIEW', result.preview));
  console.log(resultLine('TRAIT', `${input.model_name}Fields`));
  console.log(resultLine('CORE_FIELDS', input.fields.length));
  console.log(resultLine('USED_BY', `${input.model_name} Resource, ${input.model_name} Repeatable`));
  console.log(resultLine('LANG_EN_PATH',  enResult.path));
  console.log(resultLine('LANG_EN_ADDED', enResult.added.length));
  console.log(resultLine('LANG_ES_PATH',  esResult.path));
  console.log(resultLine('LANG_ES_ADDED', esResult.added.length));
}

try { main(); } catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}
