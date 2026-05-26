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
//     "handle_body":  "$loan = $this->get('loan');\n$rate = GetExchangeRate::run(['date' => $this->get('from')]);\n\nreturn ['success' => true, 'interest' => $loan->principal * $rate];"
//   }
//
// The handle_body is inserted verbatim after `$this->fill` + `$this->validate`.
// The script indents multi-line bodies appropriately.

import { dirname, join, resolve } from 'node:path';
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

function main() {
  const input = readJsonInput();
  for (const k of ['action_class_name', 'identifier', 'name', 'description', 'package_namespace', 'output_dir', 'handle_body']) {
    if (input[k] === undefined) throw new Error(`Missing required field: ${k}`);
  }

  const entity_imports     = (input.entities     || []).map(e => `${input.package_namespace}\\Models\\${e}`).sort();
  const dependency_imports = (input.dependencies || []).map(d => `${input.package_namespace}\\Services\\Actions\\${d}`).sort();

  const parameters = (input.parameters || []).map(p => ({
    name:        p.name,
    description: escapeSingle(p.description || ''),
    type_expr:   paramTypeExpr(p.type),
    rules:       rulesPhp(p.rules),
  }));

  const context = {
    package_namespace: input.package_namespace,
    action_class_name: input.action_class_name,
    identifier:        escapeSingle(input.identifier),
    name:              escapeSingle(input.name),
    description:       escapeSingle(input.description),
    parameters,
    entity_imports,
    dependency_imports,
    handle_body:       indentBody(input.handle_body, 8),
  };

  const template = loadTemplate(join(__dirname, '..', 'templates', 'action.php.tmpl'));
  const rendered = render(template, context);
  const outPath = resolve(input.output_dir, `${input.action_class_name}.php`);
  const result = writeOrConflict(outPath, rendered);

  console.log(resultLine('STATUS', result.status));
  console.log(resultLine('GENERATED', result.path));
  if (result.preview) console.log(resultLine('PREVIEW', result.preview));
  console.log(resultLine('ACTION', input.action_class_name));
  console.log(resultLine('IDENTIFIER', input.identifier));
  console.log(resultLine('PARAMETERS', parameters.length));
  console.log(resultLine('DEPENDENCIES', (input.dependencies || []).join(',') || 'none'));
}

try { main(); } catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}
