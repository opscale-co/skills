#!/usr/bin/env node
// Deterministic generator for a single PHP 8.3 backed enum.
//
// Input JSON shape:
//   {
//     "enum_name":         "OrderStatus",            // PascalCase
//     "description":       "Lifecycle of an order.", // one sentence
//     "package_namespace": "Opscale\\LoanModule",
//     "output_dir":        "src/Models/Enums",
//     "is_status_enum":    true,
//     "cases": [
//       { "name": "pending",      "meaning": "Awaiting approval." },
//       { "name": "in_progress",  "meaning": "Under review." },
//       { "name": "completed",    "meaning": "Closed successfully." }
//     ],
//     "transitions": {                              // required when is_status_enum=true
//       "pending":     ["in_progress"],
//       "in_progress": ["completed"],
//       "completed":   []                          // empty => terminal
//     }
//   }
//
// Output: writes `{output_dir}/{EnumName}.php` (conflict-aware).

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonInput, render, writeOrConflict, loadTemplate, resultLine } from './_lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function pascalCase(s) {
  return String(s).split(/[_\-\s]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('');
}

function titleCase(s) {
  return String(s).split(/[_\-\s]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function main() {
  const input = readJsonInput();

  const required = ['enum_name', 'package_namespace', 'output_dir', 'cases'];
  for (const k of required) if (!input[k]) throw new Error(`Missing required field: ${k}`);
  if (input.is_status_enum && !input.transitions) throw new Error('transitions is required when is_status_enum=true');

  const cases = input.cases.map(c => ({
    case_name: pascalCase(c.name),
    value:     c.value || titleCase(c.name),
    meaning:   c.meaning || 'TODO: describe business meaning.',
    _raw:      c.name,
  }));

  let transitions = [];
  if (input.is_status_enum) {
    transitions = cases.map(c => {
      const rule = input.transitions[c._raw] ?? [];
      const allowed = rule.map(name => pascalCase(name));
      return { case_name: c.case_name, allowed, is_terminal: allowed.length === 0 };
    });
  }

  const context = {
    package_namespace: input.package_namespace,
    enum_name:         input.enum_name,
    description:       input.description || `${input.enum_name} enum.`,
    is_status_enum:    !!input.is_status_enum,
    cases,
    transitions,
  };

  const template = loadTemplate(join(__dirname, '..', 'templates', 'enum.php.tmpl'));
  const rendered = render(template, context);

  const outPath = resolve(input.output_dir, `${input.enum_name}.php`);
  const result = writeOrConflict(outPath, rendered);

  console.log(resultLine('STATUS', result.status));
  console.log(resultLine('GENERATED', result.path));
  if (result.preview) console.log(resultLine('PREVIEW', result.preview));
  console.log(resultLine('ENUM', input.enum_name));
  console.log(resultLine('CASES', cases.length));
  console.log(resultLine('STATUS_ENUM', input.is_status_enum ? 'yes' : 'no'));
  console.log(resultLine('TRANSITIONS', input.is_status_enum ? transitions.filter(t => !t.is_terminal).length : 'N/A'));
}

try { main(); } catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}
