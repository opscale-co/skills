#!/usr/bin/env node
// Deterministic generator for a single Opscale cross-subdomain Contract
// interface and the shared HasContractRelations trait.
//
// One call per unique slug in the data-model.md `external-refs` index. The
// trait file is fixed content — it is emitted alongside the first contract
// and skipped on subsequent calls (writeOrConflict handles idempotence).
//
// Input JSON shape:
//   {
//     "contract_slug":     "users",                    // slug from external-refs index
//     "package_namespace": "Opscale\\TellerModule",
//     "contracts_dir":     "src/Contracts",
//     "concerns_dir":      "src/Models/Concerns"
//   }
//
// Output:
//   - {contracts_dir}/{StudlySlug}Contract.php  (one per call)
//   - {concerns_dir}/HasContractRelations.php   (once per package — idempotent)

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonInput, render, writeOrConflict, loadTemplate, resultLine } from './_lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function studly(slug) {
  return slug.split(/[^A-Za-z0-9]+/).filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('');
}

function main() {
  const input = readJsonInput();
  for (const k of ['contract_slug', 'package_namespace', 'contracts_dir', 'concerns_dir']) {
    if (input[k] === undefined) throw new Error(`Missing required field: ${k}`);
  }

  const contract_class = `${studly(input.contract_slug)}Contract`;

  // 1. Contract interface — one file per slug.
  const contractTemplate = loadTemplate(join(__dirname, '..', 'templates', 'contract.php.tmpl'));
  const contractRendered = render(contractTemplate, {
    package_namespace: input.package_namespace,
    contract_class,
  });
  const contractPath = resolve(input.contracts_dir, `${contract_class}.php`);
  const contractResult = writeOrConflict(contractPath, contractRendered);

  // 2. HasContractRelations trait — fixed content, idempotent.
  const traitTemplate = loadTemplate(join(__dirname, '..', 'templates', 'has-contract-relations.php.tmpl'));
  const traitRendered = render(traitTemplate, {
    package_namespace: input.package_namespace,
  });
  const traitPath = resolve(input.concerns_dir, 'HasContractRelations.php');
  const traitResult = writeOrConflict(traitPath, traitRendered);

  console.log(resultLine('STATUS',          contractResult.status));
  console.log(resultLine('GENERATED',       contractResult.path));
  if (contractResult.preview) console.log(resultLine('PREVIEW', contractResult.preview));
  console.log(resultLine('CONTRACT',        contract_class));
  console.log(resultLine('SLUG',            input.contract_slug));
  console.log(resultLine('TRAIT_STATUS',    traitResult.status));
  console.log(resultLine('TRAIT_PATH',      traitResult.path));
  if (traitResult.preview) console.log(resultLine('TRAIT_PREVIEW', traitResult.preview));
}

try { main(); } catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}
