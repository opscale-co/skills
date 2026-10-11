#!/usr/bin/env node
// INTERNAL SKILL TOOL — do not copy to projects.
// Validates docs/plan/dbml.json and projects it to dbml.dbml. Run by the
// dbml-generator agent after the JSON is authored. Exit 0 pass / 1 fail.
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
const { generate } = await import(contractLib('lib/skills/dbml.mjs'));
generate({ planDir, skillDir });
