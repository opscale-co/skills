#!/usr/bin/env node
// INTERNAL SKILL TOOL — do not copy to projects.
// Non-interactive: reads the four sibling Plan JSONs (process/dbml/bpmn/sipoc),
// deterministically BUILDS the nested docs/plan/graph.json, and projects the
// interactive, self-contained docs/plan/graph.html (replaces the old graph.mmd).
// No JSON payload — generate() self-builds from the siblings. Run by the
// plan-generator agent. Exit 0 pass / 1 fail.
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
const { generate } = await import(contractLib('lib/skills/graph.mjs'));
generate({ planDir, skillDir });
