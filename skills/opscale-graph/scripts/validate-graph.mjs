#!/usr/bin/env node
// INTERNAL SKILL TOOL — do not copy to projects.
// Thin wrapper: delegates to the shared Plan-contract validator. Validates
// the nested docs/plan/graph.json (schema + hierarchy id consistency +
// ref-resolution + counts parity) and confirms the self-contained
// docs/plan/graph.html matches its projection. Resolves the
// contract whether it sits at the repo root (shared/plan-contract) or is
// vendored into a packaged bundle. Exit 0 pass / 1 fail / 2 review.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.dirname(here);

function contractLib(rel) {
  for (const up of ['../../../shared/plan-contract', '../shared/plan-contract', '../plan-contract']) {
    const p = path.resolve(here, up, rel);
    if (fs.existsSync(p)) return p;
  }
  throw new Error('plan-contract not found (looked under shared/plan-contract and vendored paths)');
}

const dirArg = process.argv.find((a) => a.startsWith('--dir='));
const planDir = dirArg ? dirArg.slice('--dir='.length) : 'docs/plan';
const { validate } = await import(contractLib('lib/skills/graph.mjs'));
validate({ planDir, skillDir });
