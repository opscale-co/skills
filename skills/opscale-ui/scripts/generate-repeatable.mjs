#!/usr/bin/env node
// Deterministic generator for a single Nova Repeatable class.
//
// Input JSON shape:
//   {
//     "model_name":        "OrderItem",       // the Repeatable class name
//     "parent_model":      "Order",           // owns the $validationRules the fields reference
//     "package_namespace": "Opscale\\LoanModule",
//     "output_dir":        "src/Nova/Repeatables",
//     "fields": [                              // declared inline — no shared trait
//       { "field": "Text",   "label": "SKU",  "label_es": "SKU",      "attribute": "sku",
//         "modifiers": ["sortable", { "rules": "sku" }] },
//       { "field": "Number", "label": "Qty",  "label_es": "Cantidad", "attribute": "qty",
//         "modifiers": [{ "rules": "qty" }] }
//     ],
//     "lang_dir": "lang"      // optional — defaults to <project_root>/lang (derived from output_dir)
//   }
//
// Field descriptors share the shape used by generate-resource.mjs and are
// rendered by the shared renderFieldBlock() helper. `{ rules: 'col' }`
// resolves to ->rules(...{ParentModel}Model::$validationRules['col']).
//
// Output: writes `{output_dir}/{model_name}.php` and seeds every field label +
// every `{ help: '...' }` modifier into BOTH `{lang_dir}/en.json` AND
// `{lang_dir}/es.json` (created if missing; existing keys preserved).

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readJsonInput, render, writeOrConflict, loadTemplate, resultLine, seedTranslations,
  FIELD_NAMESPACE, renderFieldBlock,
} from './_lib.mjs';

function resolveLangDir(input) {
  if (input.lang_dir) return resolve(input.lang_dir);
  // output_dir is typically <project>/src/Nova/Repeatables → three levels up.
  return resolve(input.output_dir, '..', '..', '..', 'lang');
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function main() {
  const input = readJsonInput();
  for (const k of ['model_name', 'parent_model', 'package_namespace', 'output_dir', 'fields']) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }
  if (!Array.isArray(input.fields) || input.fields.length === 0) {
    throw new Error('fields must be a non-empty array — a Repeatable with no fields is meaningless.');
  }

  const parentModel = input.parent_model;
  const fields = input.fields;

  for (const f of fields) {
    if (!FIELD_NAMESPACE[f.field]) throw new Error(`Unsupported Nova field: ${f.field} (attribute '${f.attribute}')`);
    if (!f.label)    throw new Error(`Field for attribute '${f.attribute}' is missing label`);
    if (!f.label_es) throw new Error(`Field for attribute '${f.attribute}' is missing label_es (Spanish label)`);
    if (f.field === 'Select' && !f.enum_class) throw new Error(`Select field '${f.attribute}' is missing enum_class`);
    if (f.field === 'VirtualSelect' && !f.contract_class) throw new Error(`VirtualSelect field '${f.attribute}' is missing contract_class`);
    if ((f.field === 'BelongsTo' || f.field === 'MorphTo') && !f.related_resource) {
      throw new Error(`${f.field} field '${f.attribute}' is missing related_resource`);
    }
  }

  // Repeatable field items sit at 12 spaces → continuation 4 deeper.
  const contIndent = ' '.repeat(16);
  // Rules resolve against the PARENT model's $validationRules.
  const field_blocks = fields.map(f => renderFieldBlock(f, parentModel, contIndent));

  const fieldImports = new Set();
  for (const f of fields) fieldImports.add(FIELD_NAMESPACE[f.field]);
  const field_imports = [...fieldImports].sort();

  const enumSet = new Set();
  for (const f of fields) if (f.field === 'Select' && f.enum_class) enumSet.add(f.enum_class);
  const enum_imports = [...enumSet].sort().map(e => `${input.package_namespace}\\Models\\Enums\\${e}`);

  const relResSet = new Set();
  for (const f of fields) if ((f.field === 'BelongsTo' || f.field === 'MorphTo') && f.related_resource) relResSet.add(f.related_resource);
  const related_resource_imports = [...relResSet].sort().map(r => `${input.package_namespace}\\Nova\\${r}`);

  const contractSet = new Set();
  for (const f of fields) if (f.field === 'VirtualSelect' && f.contract_class) contractSet.add(f.contract_class);
  const contract_imports = [...contractSet].sort().map(c => `${input.package_namespace}\\Contracts\\${c}`);

  const context = {
    package_namespace: input.package_namespace,
    model_name:        input.model_name,
    parent_model:      parentModel,
    field_blocks,
    field_imports,
    enum_imports,
    related_resource_imports,
    contract_imports,
  };

  const template = loadTemplate(join(__dirname, '..', 'templates', 'repeatable.php.tmpl'));
  const rendered = render(template, context);
  const outPath = resolve(input.output_dir, `${input.model_name}.php`);
  const result = writeOrConflict(outPath, rendered);

  const enEntries = new Map();
  const esEntries = new Map();
  function add(en, es) {
    if (!en) return;
    if (!enEntries.has(en)) enEntries.set(en, en);
    if (!esEntries.has(en)) esEntries.set(en, es || en);
  }
  for (const f of fields) {
    add(f.label, f.label_es);
    for (const m of (f.modifiers || [])) {
      if (typeof m === 'object' && m && m.help) add(m.help, m.help_es || m.help);
    }
  }

  const langDir = resolveLangDir(input);
  const enResult = seedTranslations(langDir, 'en', enEntries);
  const esResult = seedTranslations(langDir, 'es', esEntries);

  console.log(resultLine('STATUS', result.status));
  console.log(resultLine('GENERATED', result.path));
  if (result.preview) console.log(resultLine('PREVIEW', result.preview));
  console.log(resultLine('REPEATABLE', input.model_name));
  console.log(resultLine('PARENT_MODEL', parentModel));
  console.log(resultLine('FIELDS', fields.length));
  console.log(resultLine('LANG_EN_PATH',  enResult.path));
  console.log(resultLine('LANG_EN_ADDED', enResult.added.length));
  console.log(resultLine('LANG_ES_PATH',  esResult.path));
  console.log(resultLine('LANG_ES_ADDED', esResult.added.length));
}

try { main(); } catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}
