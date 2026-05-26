#!/usr/bin/env node
// Deterministic generator for a single repository trait.
//
// Input JSON shape:
//   {
//     "model_name":        "Order",
//     "package_namespace": "Opscale\\LoanModule",
//     "output_dir":        "src/Models/Repositories",
//     "tenant_aware":      true,
//     "has_status":        true,
//     "status_enum":       "OrderStatus",
//     "scopes": [
//       {
//         "name":        "Active",
//         "description": "Non-terminal orders.",
//         "params":      [],
//         "body":        "return $query->whereNotIn('status', [OrderStatus::Cancelled->value, OrderStatus::Completed->value]);"
//       },
//       {
//         "name":        "ForTenant",
//         "description": "Scope by tenant.",
//         "params":      [{ "name": "tenantId", "type": "string" }],
//         "body":        "return $query->where('tenant_id', $tenantId);"
//       }
//     ],
//     "write_methods": [
//       {
//         "name":        "createFromQuote",
//         "description":"Create an Order from a Quote.",
//         "params":      [{ "name": "data", "type": "array" }],
//         "return_type": "static",
//         "body":        "return static::create([\n            'tenant_id' => $data['tenant_id'],\n            'code'      => $data['code'],\n            'status'    => OrderStatus::Pending,\n        ]);"
//       }
//     ]
//   }
//
// Multi-line `body` strings are indented inside the method by the script.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonInput, render, writeOrConflict, loadTemplate, resultLine } from './_lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function indentBody(body, spaces) {
  const pad = ' '.repeat(spaces);
  return body.split('\n').map((line, i) => i === 0 ? line : pad + line).join('\n');
}

function main() {
  const input = readJsonInput();
  for (const k of ['model_name', 'package_namespace', 'output_dir']) {
    if (!input[k]) throw new Error(`Missing required field: ${k}`);
  }

  const scopes = (input.scopes || []).map(s => ({
    name:        s.name,
    description: s.description || `${s.name} scope.`,
    params:      s.params || [],
    body:        indentBody(s.body, 8),
  }));

  const write_methods = (input.write_methods || []).map(w => ({
    name:        w.name,
    description: w.description || `${w.name} method.`,
    params:      w.params || [],
    return_type: w.return_type || 'static',
    body:        indentBody(w.body, 8),
  }));

  const has_boot = !!input.has_status; // boot only when status hooks needed

  const context = {
    package_namespace: input.package_namespace,
    model_name:        input.model_name,
    has_status:        !!input.has_status,
    status_enum:       input.status_enum || '',
    has_boot,
    scopes,
    write_methods,
  };

  const template = loadTemplate(join(__dirname, '..', 'templates', 'repository.php.tmpl'));
  const rendered = render(template, context);
  const outPath = resolve(input.output_dir, `${input.model_name}Repository.php`);
  const result = writeOrConflict(outPath, rendered);

  console.log(resultLine('STATUS', result.status));
  console.log(resultLine('GENERATED', result.path));
  if (result.preview) console.log(resultLine('PREVIEW', result.preview));
  console.log(resultLine('REPOSITORY', `${input.model_name}Repository`));
  console.log(resultLine('MODEL', input.model_name));
  console.log(resultLine('SCOPES', scopes.length));
  console.log(resultLine('BOOT_HOOKS', has_boot ? 'yes' : 'no'));
  console.log(resultLine('STATUS_TRANSITIONS', input.has_status ? 'yes' : 'no'));
  console.log(resultLine('TENANT_SCOPED', input.tenant_aware ? 'yes' : 'no'));
  console.log(resultLine('WRITE_METHODS', write_methods.length));
}

try { main(); } catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}
