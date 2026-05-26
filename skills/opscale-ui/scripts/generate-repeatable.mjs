#!/usr/bin/env node
// Deterministic generator for a single Nova Repeatable class.
//
// Input JSON shape:
//   {
//     "model_name":        "OrderItem",
//     "parent_model":      "Order",
//     "package_namespace": "Opscale\\LoanModule",
//     "output_dir":        "src/Nova/Repeatables"
//   }
//
// The Repeatable consumes the {ModelName}Fields trait — make sure
// field-trait-generator ran first for this model.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonInput, render, writeOrConflict, loadTemplate, resultLine } from './_lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function main() {
  const input = readJsonInput();
  for (const k of ['model_name', 'parent_model', 'package_namespace', 'output_dir']) {
    if (!input[k]) throw new Error(`Missing required field: ${k}`);
  }

  const context = {
    package_namespace: input.package_namespace,
    model_name:        input.model_name,
  };

  const template = loadTemplate(join(__dirname, '..', 'templates', 'repeatable.php.tmpl'));
  const rendered = render(template, context);
  const outPath = resolve(input.output_dir, `${input.model_name}.php`);
  const result = writeOrConflict(outPath, rendered);

  console.log(resultLine('STATUS', result.status));
  console.log(resultLine('GENERATED', result.path));
  if (result.preview) console.log(resultLine('PREVIEW', result.preview));
  console.log(resultLine('REPEATABLE', input.model_name));
  console.log(resultLine('PARENT', input.parent_model));
  console.log(resultLine('USES_TRAIT', `${input.model_name}Fields`));
}

try { main(); } catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}
