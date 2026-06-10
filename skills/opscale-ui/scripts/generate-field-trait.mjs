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
//         "label":     "Code",
//         "attribute": "code",
//         "modifiers": [
//           "sortable",
//           { "rules": "code" }                 // → ->rules(...Order::$validationRules['code'])
//         ]
//       },
//       {
//         "field":      "Select",
//         "label":      "Type",
//         "attribute":  "type",
//         "enum_class": "OrderType",            // required when field=Select with enum options
//         "modifiers":  ["filterable", "displayUsingLabels", { "rules": "type" }]
//       },
//       {
//         "field":             "BelongsTo",
//         "label":             "Customer",
//         "attribute":         "customer",
//         "related_resource":  "Customer",
//         "modifiers": ["searchable", { "rules": "customer_id" }]
//       },
//       {
//         "field":     "Boolean",
//         "label":     "Is Active",
//         "attribute": "is_active",
//         "modifiers": ["sortable"]
//       },
//       {
//         "field":     "Number",
//         "label":     "Amount",
//         "attribute": "amount",
//         "modifiers": ["sortable", { "rules": "amount" }]
//       }
//     ],
//
//     "lang_dir": "lang",     // optional — defaults to <project_root>/lang (derived from output_dir)
//     "locale":   "en"        // optional — default locale to seed; defaults to "en"
//   }
//
// Output: writes `{output_dir}/{ModelName}Fields.php` and seeds every field
// label + every `{ help: '...' }` modifier into `{lang_dir}/{locale}.json`
// (created if missing; existing keys preserved).

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
  Text:       'Laravel\\Nova\\Fields\\Text',
  Textarea:   'Laravel\\Nova\\Fields\\Textarea',
  Trix:       'Laravel\\Nova\\Fields\\Trix',
  Number:     'Laravel\\Nova\\Fields\\Number',
  Boolean:    'Laravel\\Nova\\Fields\\Boolean',
  Select:     'Laravel\\Nova\\Fields\\Select',
  BelongsTo:  'Laravel\\Nova\\Fields\\BelongsTo',
  MorphTo:    'Laravel\\Nova\\Fields\\MorphTo',
  Date:       'Laravel\\Nova\\Fields\\Date',
  DateTime:   'Laravel\\Nova\\Fields\\DateTime',
  Currency:   'Laravel\\Nova\\Fields\\Currency',
  Email:      'Laravel\\Nova\\Fields\\Email',
  Password:   'Laravel\\Nova\\Fields\\Password',
  File:       'Laravel\\Nova\\Fields\\File',
  Image:      'Laravel\\Nova\\Fields\\Image',
  Slug:       'Laravel\\Nova\\Fields\\Slug',
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

  for (const f of input.fields) {
    if (!FIELD_NAMESPACE[f.field]) throw new Error(`Unsupported Nova field: ${f.field}`);
    fieldClassSet.add(FIELD_NAMESPACE[f.field]);
    if (f.field === 'Select' && f.enum_class) enumSet.add(f.enum_class);
    if ((f.field === 'BelongsTo' || f.field === 'MorphTo') && f.related_resource) relResSet.add(f.related_resource);
  }

  const imports                  = [...fieldClassSet].sort();
  const enum_imports             = [...enumSet].sort().map(e => `${input.package_namespace}\\Models\\Enums\\${e}`);
  const related_resource_imports = [...relResSet].sort().map(r => `${input.package_namespace}\\Nova\\${r}`);

  const field_blocks = input.fields.map(f => renderFieldBlock(f, input.model_name));

  const context = {
    package_namespace: input.package_namespace,
    model_name:        input.model_name,
    imports,
    enum_imports,
    related_resource_imports,
    field_blocks,
  };

  const template = loadTemplate(join(__dirname, '..', 'templates', 'field-trait.php.tmpl'));
  const rendered = render(template, context);
  const outPath = resolve(input.output_dir, `${input.model_name}Fields.php`);
  const result = writeOrConflict(outPath, rendered);

  // Seed translation keys for every user-visible string in the field set.
  const translationKeys = new Set();
  for (const f of input.fields) {
    if (f.label) translationKeys.add(f.label);
    for (const m of (f.modifiers || [])) {
      if (typeof m === 'object' && m && m.help) translationKeys.add(m.help);
    }
  }

  const langDir = resolveLangDir(input);
  const locale  = input.locale || 'en';
  const langResult = seedTranslations(langDir, locale, translationKeys);

  console.log(resultLine('STATUS', result.status));
  console.log(resultLine('GENERATED', result.path));
  if (result.preview) console.log(resultLine('PREVIEW', result.preview));
  console.log(resultLine('TRAIT', `${input.model_name}Fields`));
  console.log(resultLine('CORE_FIELDS', input.fields.length));
  console.log(resultLine('USED_BY', `${input.model_name} Resource, ${input.model_name} Repeatable`));
  console.log(resultLine('LANG_PATH',  langResult.path));
  console.log(resultLine('LANG_ADDED', langResult.added.length));
}

try { main(); } catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}
