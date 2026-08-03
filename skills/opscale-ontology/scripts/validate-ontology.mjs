#!/usr/bin/env node
// INTERNAL SKILL TOOL — do not copy to projects.
// Mandatory gate for opscale-ontology: verifies docs/plan/ontology.html is
// coherent with the canonical Plan artifacts it was rendered from.
// Node stdlib only (fs, path, process) — runs offline, no dependencies.
//
// Usage: node scripts/validate-ontology.mjs [--dir=docs/plan]
// Exit codes: 0 = pass, 1 = fail (details on stdout).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dirArg = process.argv.find((a) => a.startsWith('--dir='));
const DIR = dirArg ? dirArg.slice('--dir='.length) : 'docs/plan';

const failures = [];
const fail = (msg) => failures.push(msg);

function read(name, { required = true } = {}) {
  const p = join(DIR, name);
  if (!existsSync(p)) {
    if (required) fail(`missing source file: ${p}`);
    return null;
  }
  return readFileSync(p, 'utf8');
}

const html = read('ontology.html');
const processTxt = read('process.txt');
const operationsMd = read('operations.md');
const sipocTxt = read('sipoc.txt');
const dbmlTxt = read('dbml.txt');
const domainMap = read('context/system.map.md');

// One {kebab-subprocess}.txt per subprocess — the per-subprocess operation
// outlines that replaced the single bpmn.txt.
const subprocessesDir = join(DIR, 'subprocesses');
const subprocessFiles = existsSync(subprocessesDir)
  ? readdirSync(subprocessesDir).filter((f) => f.endsWith('.txt'))
  : (fail(`missing directory: ${subprocessesDir}`), []);
const subprocessesTxt = subprocessFiles
  .map((f) => readFileSync(join(subprocessesDir, f), 'utf8'))
  .join('\n\n');

const actionsDir = join(DIR, 'actions');
const actionFiles = existsSync(actionsDir)
  ? readdirSync(actionsDir).filter((f) => f.endsWith('.md'))
  : (fail(`missing directory: ${actionsDir}`), []);
const actionsTxt = actionFiles
  .map((f) => readFileSync(join(actionsDir, f), 'utf8'))
  .join('\n\n');

if (failures.length) {
  console.log('validate-ontology: FAIL');
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}

// ---- 1. Template integrity -------------------------------------------------
const BEGIN = '<!-- ONTOLOGY:BEGIN -->';
const END = '<!-- ONTOLOGY:END -->';
if (!html.includes(BEGIN) || !html.includes(END)) {
  console.log('validate-ontology: FAIL');
  console.log('  ✗ ONTOLOGY:BEGIN / ONTOLOGY:END markers are missing');
  process.exit(1);
}
const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
if (leftover) fail(`unfilled placeholders remain: ${[...new Set(leftover)].join(', ')}`);

// All node counting happens inside the authored region only — the fixed
// <style> block outside it contains the same data-level strings as selectors.
const region = html.slice(html.indexOf(BEGIN) + BEGIN.length, html.indexOf(END));

// ---- helpers ---------------------------------------------------------------
const countMatches = (text, re) => (text.match(re) ?? []).length;
const blocks = (txt) =>
  txt.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
const stepLines = (txt) => countMatches(txt, /^\d+\) /gm);

// Every element tag carrying data-level="operation"
const opTags = region.match(/<(?:details|div)\b[^>]*data-level="operation"[^>]*>/g) ?? [];
const catOf = (tag) => (tag.match(/data-cat="([a-z]+)"/) ?? [])[1] ?? '?';
const opCats = opTags.map(catOf);

// ---- 2. Subprocesses and steps vs process.txt ------------------------------
const subCount = countMatches(region, /data-level="subprocess"/g);
const subExpected = blocks(processTxt).length;
if (subCount !== subExpected)
  fail(`subprocess nodes: ${subCount} in HTML, ${subExpected} blocks in process.txt`);
if (subprocessFiles.length !== subExpected)
  fail(`subprocesses/ has ${subprocessFiles.length} .txt files, process.txt has ${subExpected} blocks — one file per subprocess`);

const stepCount = countMatches(region, /data-level="step"/g);
const stepExpected = stepLines(processTxt);
if (stepCount !== stepExpected)
  fail(`step nodes: ${stepCount} in HTML, ${stepExpected} steps in process.txt`);

// ---- 3. Operations vs subprocesses/*.txt -----------------------------------
// Events (waits) and gateways are flow elements, not operations (ONTOLOGY.md);
// the subprocess outlines may list them, but they render as flow markers,
// never operation nodes.
const opExpected = countMatches(subprocessesTxt, /^- (?!gateway:|event:)/gm);
if (opTags.length !== opExpected)
  fail(`operation nodes: ${opTags.length} in HTML, ${opExpected} operations in subprocesses/*.txt (gateway/event lines excluded)`);

// ---- 4. Logic four-way count -----------------------------------------------
const compositionIds = [...operationsMd.matchAll(/^- ([a-z0-9][a-z0-9-]*) — business step:/gm)]
  .map((m) => m[1]);
const sipocTxtIds = [...sipocTxt.matchAll(/^\S.*\(([a-z0-9][a-z0-9-]*)\)\s*$/gm)].map((m) => m[1]);
const actionIds = actionFiles.map((f) => f.replace(/\.md$/, ''));
const htmlLogicIds = opTags
  .filter((t) => catOf(t) === 'logic')
  .map((t) => (t.match(/data-id="([a-z0-9-]+)"/) ?? [])[1])
  .filter(Boolean);

const sets = {
  'operations.md Composition': compositionIds,
  'actions/ files': actionIds,
  'sipoc.txt blocks': sipocTxtIds,
  'HTML logic nodes': htmlLogicIds,
};
const counts = Object.entries(sets).map(([k, v]) => `${k}=${v.length}`).join(', ');
const sizes = new Set(Object.values(sets).map((v) => v.length));
if (sizes.size !== 1) fail(`Logic count differs across sources: ${counts}`);
for (const [name, ids] of Object.entries(sets)) {
  for (const id of compositionIds)
    if (!ids.includes(id)) fail(`logic "${id}" missing from ${name}`);
}

// ---- 5. Inner CRUDs per Logic vs Composition -------------------------------
const compLines = operationsMd.split('\n');
const composedOf = {};
for (let i = 0; i < compLines.length; i++) {
  const m = compLines[i].match(/^- ([a-z0-9][a-z0-9-]*) — business step:/);
  if (!m) continue;
  let n = 0;
  for (let j = i + 1; j < compLines.length && /^\s+- /.test(compLines[j]); j++) n++;
  composedOf[m[1]] = n;
}
for (const id of htmlLogicIds) {
  const start = region.indexOf(`data-id="${id}"`);
  if (start === -1) continue;
  const rest = region.slice(start);
  const next = rest.slice(1).search(/data-id="/);
  const slice = next === -1 ? rest : rest.slice(0, next + 1);
  const inner = countMatches(slice, /data-inner="crud"/g);
  const expected = composedOf[id];
  if (expected !== undefined && inner !== expected)
    fail(`logic "${id}": ${inner} inner CRUDs in HTML, ${expected} composed CRUDs in operations.md`);
}

// ---- 6. Badges exist in their sources --------------------------------------
const entities = new Set(dbmlTxt.split('\n').map((l) => l.trim()).filter(Boolean));
const entityBadges = [...region.matchAll(/class="badge entity">([^<]+)</g)].map((m) => m[1].trim());
for (const e of new Set(entityBadges))
  if (!entities.has(e)) fail(`entity badge "${e}" not found in dbml.txt`);

const brBadges = [...region.matchAll(/class="badge br">(BR-\d+)</g)].map((m) => m[1]);
for (const br of new Set(brBadges))
  if (!actionsTxt.includes(br)) fail(`rule badge "${br}" not defined in any actions/*.md (Business Rules enforced)`);

// ---- 7. Stats bar matches the computed counts ------------------------------
const stat = (name) => {
  const m = html.match(new RegExp(`data-stat="${name}"[^>]*>([0-9]+)<`));
  return m ? Number(m[1]) : null;
};
const expectStat = (name, expected) => {
  const got = stat(name);
  if (got === null) fail(`stat "${name}" missing from header`);
  else if (got !== expected) fail(`stat "${name}": header says ${got}, computed ${expected}`);
};
expectStat('subprocesses', subExpected);
expectStat('steps', stepExpected);
expectStat('operations', opExpected);
expectStat('crud', opCats.filter((c) => c === 'crud').length);
expectStat('logic', htmlLogicIds.length);
expectStat('output', opCats.filter((c) => c === 'output').length);
expectStat('rules', new Set(brBadges).size);
expectStat('entities', new Set(entityBadges).size);

// ---- 8. Header chain vs system.map.md --------------------------------------
const h1 = (html.match(/<h1>([\s\S]*?)<\/h1>/) ?? [])[1]?.replace(/<[^>]+>/g, ' ') ?? '';
const software = (domainMap.match(/^# System map — (.+)$/m) ?? [])[1]?.trim();
if (software && !h1.includes(software))
  fail(`software name "${software}" (system.map.md) not in the header chain`);
const domains = [...domainMap.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim());
if (domains.length && !domains.some((d) => h1.includes(d)))
  fail(`no domain from system.map.md (${domains.join(', ')}) appears in the header chain`);

// ---- report ----------------------------------------------------------------
if (failures.length) {
  console.log('validate-ontology: FAIL');
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `validate-ontology: PASS — ${subExpected} subprocesses, ${stepExpected} steps, ` +
  `${opExpected} operations (${htmlLogicIds.length} logic), ` +
  `${new Set(brBadges).size} rules, ${new Set(entityBadges).size} entities`
);
process.exit(0);
