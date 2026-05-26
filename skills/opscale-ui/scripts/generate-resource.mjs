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
//     ]
//   }
//
// Tab structure is applied automatically when has_many_relationships is
// non-empty (per Opscale UI convention).

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonInput, render, writeOrConflict, loadTemplate, resultLine } from './_lib.mjs';

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

  const context = {
    package_namespace:        input.package_namespace,
    model_name:               input.model_name,
    title_column:             input.title_column,
    search_columns:           input.search_columns || [input.title_column],
    uri_key:                  input.uri_key,
    label:                    input.label,
    singular_label:           input.singular_label,
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

  console.log(resultLine('STATUS', result.status));
  console.log(resultLine('GENERATED', result.path));
  if (result.preview) console.log(resultLine('PREVIEW', result.preview));
  console.log(resultLine('RESOURCE', input.model_name));
  console.log(resultLine('MODEL', `${input.package_namespace}\\Models\\${input.model_name}`));
  console.log(resultLine('TABS', has_tabs ? 1 + has_many.length : 0));
  console.log(resultLine('HAS_MANY', has_many.length));
  console.log(resultLine('USES_TRAIT', context.uses_field_trait ? 'yes' : 'no'));
  console.log(resultLine('STATUS_BADGE', input.has_status ? 'yes' : 'no'));
}

try { main(); } catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}
