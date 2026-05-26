#!/usr/bin/env node
// Deterministic generator for a single PHP readonly Value Object class.
//
// Input JSON shape:
//   {
//     "vo_name":           "MoneyAmount",
//     "description":       "Monetary value with currency.",
//     "package_namespace": "Opscale\\LoanModule",
//     "output_dir":        "src/Models/ValueObjects",
//     "properties": [
//       { "name": "amount",   "type": "int",    "column": "amount_cents" },
//       { "name": "currency", "type": "string", "column": "currency_code" }
//     ],
//     "validations": [
//       { "condition": "$this->amount < 0",          "message": "amount cannot be negative." },
//       { "condition": "strlen($this->currency) !== 3", "message": "currency must be ISO 4217." }
//     ]
//   }
//
// Output: writes `{output_dir}/{VOName}.php` (conflict-aware).

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonInput, render, writeOrConflict, loadTemplate, resultLine } from './_lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function main() {
  const input = readJsonInput();

  for (const k of ['vo_name', 'package_namespace', 'output_dir', 'properties']) {
    if (!input[k]) throw new Error(`Missing required field: ${k}`);
  }

  const property_column_map = input.properties
    .filter(p => p.column)
    .map(p => ({ property: p.name, column: p.column }));

  const context = {
    package_namespace: input.package_namespace,
    vo_name:           input.vo_name,
    description:       input.description || `${input.vo_name} value object.`,
    properties:        input.properties.map(p => ({ name: p.name, type: p.type })),
    validations:       input.validations || [],
    property_column_map,
  };

  const template = loadTemplate(join(__dirname, '..', 'templates', 'value-object.php.tmpl'));
  const rendered = render(template, context);
  const outPath = resolve(input.output_dir, `${input.vo_name}.php`);
  const result = writeOrConflict(outPath, rendered);

  console.log(resultLine('STATUS', result.status));
  console.log(resultLine('GENERATED', result.path));
  if (result.preview) console.log(resultLine('PREVIEW', result.preview));
  console.log(resultLine('VALUE_OBJECT', input.vo_name));
  console.log(resultLine('PROPERTIES', input.properties.length));
  console.log(resultLine('COLUMNS_MAPPED', property_column_map.map(m => m.column).join(',') || 'none'));
  console.log(resultLine('VALIDATIONS', context.validations.length));
}

try { main(); } catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}
