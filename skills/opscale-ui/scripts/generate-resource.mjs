#!/usr/bin/env node
// Deterministic generator for a single Nova Resource class.
//
// Input JSON shape:
//   {
//     "model_name":           "Order",
//     "package_namespace":    "Opscale\\LoanModule",
//     "output_dir":           "src/Nova",
//     "title_column":         "code",
//     "search_columns":       ["code"],
//     "uri_key":              "orders",
//     "label":                "Orders",
//     "singular_label":       "Order",
//     "uses_field_trait":     true,
//     "has_status":           true,
//     "status_enum":          "OrderStatus",
//     "status_badge": {
//       "map":    [{ "case": "Pending", "color": "warning" }, ...],
//       "labels": [{ "case": "Pending", "label": "Pending" }, ...]
//     },
//     "has_many_relationships": [
//       { "name": "items", "label": "Items", "related_resource": "OrderItem" }
//     ],
//
//     "can_create": true,     // optional — default true; when false, emit authorizedToCreate
//     "can_update": true,     // optional — default true; when false, emit authorizedToUpdate
//     "can_delete": true,     // optional — default true; when false, emit authorizedToDelete
//
//     "lang_dir": "lang",     // optional — defaults to <project_root>/lang (derived from output_dir)
//     "locale":   "en"        // optional — default locale to seed; defaults to "en"
//   }
//
// Tab structure is applied automatically when has_many_relationships is
// non-empty (per Opscale UI convention).
//
// Translation seeding: the script appends to `{lang_dir}/{locale}.json`:
//   - the resource label and singular label
//   - each status badge label (when has_status)
//   - each HasMany tab label
//   - "Details", "Created At", "Updated At", "Status" (the standard fixed labels)
// The file is created (as `{}`) if missing. Existing keys are never overwritten.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonInput, render, writeOrConflict, loadTemplate, resultLine, seedTranslations } from './_lib.mjs';

function resolveLangDir(input) {
  if (input.lang_dir) return resolve(input.lang_dir);
  // output_dir is typically <project>/src/Nova → two levels up is <project>.
  return resolve(input.output_dir, '..', '..', 'lang');
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function main() {
  const input = readJsonInput();
  for (const k of ['model_name', 'package_namespace', 'output_dir', 'title_column', 'uri_key', 'label', 'singular_label']) {
    if (!input[k]) throw new Error(`Missing required field: ${k}`);
  }

  const has_many = input.has_many_relationships || [];
  const has_tabs = has_many.length > 0;

  // Field imports — always include the basics; add HasMany only when needed.
  const fieldImports = new Set([
    'Laravel\\Nova\\Fields\\DateTime',
  ]);
  if (input.has_status) fieldImports.add('Laravel\\Nova\\Fields\\Badge');
  if (has_many.length)   fieldImports.add('Laravel\\Nova\\Fields\\HasMany');

  const field_imports = [...fieldImports].sort();

  const related_resource_imports = has_many
    .map(r => `${input.package_namespace}\\Nova\\${r.related_resource}`)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();

  const can_create = input.can_create !== false; // default true
  const can_update = input.can_update !== false;
  const can_delete = input.can_delete !== false;

  const context = {
    package_namespace:        input.package_namespace,
    model_name:               input.model_name,
    title_column:             input.title_column,
    search_columns:           input.search_columns || [input.title_column],
    uri_key:                  input.uri_key,
    label:                    input.label,
    singular_label:           input.singular_label,
    can_create,
    can_update,
    can_delete,
    uses_field_trait:         input.uses_field_trait !== false, // default true
    has_status:               !!input.has_status,
    status_enum:              input.status_enum || '',
    status_badge:             input.status_badge || { map: [], labels: [] },
    has_many_relationships:   has_many,
    has_tabs,
    field_imports,
    related_resource_imports,
  };

  const template = loadTemplate(join(__dirname, '..', 'templates', 'resource.php.tmpl'));
  const rendered = render(template, context);
  const outPath = resolve(input.output_dir, `${input.model_name}.php`);
  const result = writeOrConflict(outPath, rendered);

  // Seed translation keys for every user-visible string the template emits.
  const translationKeys = new Set([
    input.label,
    input.singular_label,
    'Details',
    'Created At',
    'Updated At',
  ]);
  if (input.has_status) translationKeys.add('Status');
  for (const entry of (context.status_badge.labels || [])) translationKeys.add(entry.label);
  for (const rel of has_many) translationKeys.add(rel.label);

  const langDir = resolveLangDir(input);
  const locale  = input.locale || 'en';
  const langResult = seedTranslations(langDir, locale, translationKeys);

  console.log(resultLine('STATUS', result.status));
  console.log(resultLine('GENERATED', result.path));
  if (result.preview) console.log(resultLine('PREVIEW', result.preview));
  console.log(resultLine('RESOURCE', input.model_name));
  console.log(resultLine('MODEL', `${input.package_namespace}\\Models\\${input.model_name}`));
  console.log(resultLine('TABS', has_tabs ? 1 + has_many.length : 0));
  console.log(resultLine('HAS_MANY', has_many.length));
  console.log(resultLine('USES_TRAIT', context.uses_field_trait ? 'yes' : 'no'));
  console.log(resultLine('STATUS_BADGE', input.has_status ? 'yes' : 'no'));
  console.log(resultLine('CAN_CREATE', can_create ? 'yes' : 'no'));
  console.log(resultLine('CAN_UPDATE', can_update ? 'yes' : 'no'));
  console.log(resultLine('CAN_DELETE', can_delete ? 'yes' : 'no'));
  console.log(resultLine('LANG_PATH',  langResult.path));
  console.log(resultLine('LANG_ADDED', langResult.added.length));
}

try { main(); } catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}
