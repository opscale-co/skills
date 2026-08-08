#!/usr/bin/env node
// INTERNAL SKILL TOOL — do not copy to projects.
// Mandatory gate for opscale-ontology: verifies docs/plan/ontology.mmd +
// docs/plan/ontology.txt are coherent with the canonical Plan artifacts they
// were rendered from. Node stdlib only (fs, path, process) — runs offline.
//
// v4 id standard: subprocess SP-XX, step SP-XX-YY, operation oid
// SP-XX-YY-[C|L|O]ZZ (nested …-[C|L|O]AA inside a Logic), entity = kebab of
// its table name, domain/subdomain = project slugs xxx / xxx/yyy.
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

const mmd = read('ontology.mmd');
const outline = read('ontology.txt');
const processTxt = read('process.txt');
const bpmnTxt = read('bpmn.txt');
const bpmnXml = read('bpmn.bpmn');
const sipocTxt = read('sipoc.txt');
const dbmlTxt = read('dbml.txt');
const domainDbml = read('dbml.dbml');
const systemMap = read('context/system.map.md');
const externalRefsMd = read('context/external-refs.md', { required: false });

const sipocDir = join(DIR, 'sipoc');
const sipocFiles = existsSync(sipocDir)
  ? readdirSync(sipocDir).filter((f) => f.endsWith('.md') && !f.endsWith('.opscale-preview'))
  : (fail(`missing directory: ${sipocDir}`), []);
const sipocAll = sipocFiles
  .map((f) => readFileSync(join(sipocDir, f), 'utf8'))
  .join('\n\n');

if (failures.length) {
  console.log('validate-ontology: FAIL');
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}

// ---- helpers ---------------------------------------------------------------
const blocks = (txt) => txt.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
const OID = /SP-\d{2,}-\d{2,}-[CLO]\d{2,}(?:-[CLO]\d{2,})?/;

// ---- Mermaid syntax lint — treeView ----------------------------------------
// Self-contained: checks the diagram is valid Mermaid `treeView-beta` so it
// actually renders, independent of the semantic cross-checks below. treeView
// rules: a `treeView-beta` header; `%%` comment lines; node lines are indented
// (multiples of the unit), the label is quoted, quotes are balanced, a node
// with children ends with `/`, and indentation only ever deepens one level at
// a time.
function lintMermaidTreeView(text) {
  const errs = [];
  const raw = text.split('\n');
  const first = raw.find((l) => l.trim() && !l.trim().startsWith('%%'));
  if (first !== undefined && !/^\s*treeView-beta\s*$/.test(first))
    errs.push(`first statement must be the "treeView-beta" header (found "${first.trim().slice(0, 30)}")`);

  const nodeLines = raw
    .map((l, i) => ({ l, ln: i + 1 }))
    .filter(({ l }) => /^\s+\S/.test(l) && !l.trim().startsWith('%%'));
  const indents = nodeLines.map(({ l }) => l.match(/^(\s*)/)[1].length).filter((n) => n > 0);
  const unit = indents.length ? Math.min(...indents) : 4;

  let prevDepth = -1;
  nodeLines.forEach(({ l, ln }, idx) => {
    const lead = l.match(/^(\s*)/)[1].length;
    if (lead % unit !== 0)
      errs.push(`line ${ln}: indentation (${lead}) is not a multiple of ${unit} — treeView levels must align`);
    const depth = Math.round(lead / unit);
    if (idx > 0 && depth > prevDepth + 1)
      errs.push(`line ${ln}: indentation jumps ${depth - prevDepth} levels at once — deepen one level at a time`);
    prevDepth = depth;

    const body = l.trim();
    if (((body.match(/"/g) || []).length) % 2 !== 0)
      errs.push(`line ${ln}: unbalanced double-quote — "${body.slice(0, 40)}"`);
    // label must be quoted (our labels carry spaces/emoji); form: "…"[/][:::class][ ## desc]
    if (!/^"[^"]*"\/?(\s*:::[A-Za-z0-9_-]+)?(\s*##\s+\S.*)?\s*$/.test(body))
      errs.push(`line ${ln}: node must be a quoted label, optional trailing "/" for a parent — "${body.slice(0, 40)}"`);

    // a node whose next node is deeper is a parent and must end with "/"
    const next = nodeLines[idx + 1];
    if (next) {
      const nextDepth = Math.round(next.l.match(/^(\s*)/)[1].length / unit);
      const label = (body.match(/^"([^"]*)"/) ?? [, ''])[1];
      const hasSlash = /^"[^"]*"\//.test(body);
      if (nextDepth > depth && !hasSlash)
        errs.push(`line ${ln}: "${label.slice(0, 30)}" has children — its label must end with "/"`);
    }
  });
  return errs;
}
{
  const mermaidErrs = lintMermaidTreeView(mmd);
  for (const e of mermaidErrs) fail(`mermaid: ${e}`);
}

// ---- parse ontology.mmd ----------------------------------------------------
if (!/^\s*treeView-beta\s*$/.test(mmd.split('\n')[0]))
  fail('ontology.mmd must open with the `treeView-beta` header');

const metaModule = (mmd.match(/^%% module:\s*(.+)$/m) ?? [])[1] ?? '';
if (!metaModule) fail('ontology.mmd missing the `%% module: xxx/yyy | domain: … | software: …` metadata line');
if (!/^[a-z0-9-]+\/[a-z0-9-]+\s*\|/.test(metaModule))
  fail(`%% module: line must open with the subdomain project id (xxx/yyy) — found "${metaModule.slice(0, 40)}"`);
const metaEntities = [...mmd.matchAll(/^%% entity:\s*([a-z][a-z0-9-]*)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)$/gm)]
  .map((m) => ({ id: m[1], name: m[2].trim(), table: m[4].trim(), enums: m[5].trim() }));
const metaExternals = [...mmd.matchAll(/^%% external:\s*ref:([a-z0-9_-]+)\s*\|/gm)].map((m) => m[1]);

// tree nodes: indented, quoted labels; depth from leading spaces
const nodeLines = mmd.split('\n').filter((l) => /^\s+"/.test(l));
const indents = nodeLines.map((l) => l.match(/^(\s*)/)[1].length);
const unit = Math.min(...indents.filter((n) => n > 0)) || 4;
const nodes = nodeLines.map((l) => {
  const depth = Math.round(l.match(/^(\s*)/)[1].length / unit) - 1; // root at depth 0
  const label = (l.match(/"([^"]*)"/) ?? [, ''])[1];
  return { depth, label };
});

// classify by depth + emoji, tracking whether we are inside a ⚙️ node.
// Outputs (📩) are ALWAYS composed inside a Logic — never top-level. `inner`
// holds composed CRUDs; `innerOutput` holds composed Outputs; `innerLogic`
// holds composed Logic references (leaf ⚙️ nodes — reuse of an Action defined
// elsewhere; never expanded here).
const tree = { software: [], domain: [], module: [], subprocess: [], step: [], crud: [], logic: [], inner: [], innerOutput: [], innerLogic: [] };
let logicDepth = null;
for (const n of nodes) {
  if (logicDepth !== null && n.depth <= logicDepth) logicDepth = null;
  if (logicDepth !== null && n.label.startsWith('📝')) { tree.inner.push(n); continue; }
  if (logicDepth !== null && n.label.startsWith('📩')) { tree.innerOutput.push(n); continue; }
  if (logicDepth !== null && n.label.startsWith('⚙️')) { tree.innerLogic.push(n); continue; }
  if (n.depth === 0) tree.software.push(n);
  else if (n.depth === 1) tree.domain.push(n);
  else if (n.depth === 2) tree.module.push(n);
  else if (n.label.startsWith('⏳')) tree.subprocess.push(n);
  else if (n.label.startsWith('⚙️')) { tree.logic.push(n); logicDepth = n.depth; }
  else if (n.label.startsWith('📝')) tree.crud.push(n);
  else if (n.label.startsWith('📩')) fail(`output node "${n.label}" is top-level — Outputs must be composed inside a Logic`);
  else if (n.depth === 4) tree.step.push(n);
  else fail(`unclassifiable node "${n.label}" at depth ${n.depth}`);
}
const oidOf = (n) => (n.label.match(OID) ?? [])[0] ?? null;

// ---- 1. Header chain vs system.map.md --------------------------------------
const software = (systemMap.match(/^# System map — (.+)$/m) ?? [])[1]?.trim();
if (software && !metaModule.includes(software))
  fail(`%% module: line does not carry software "${software}" (system.map.md)`);
if (tree.software.length !== 1) fail(`tree must have exactly 1 software root (found ${tree.software.length})`);
if (software && tree.software[0] && !tree.software[0].label.includes(software))
  fail(`software root "${tree.software[0]?.label}" ≠ system.map.md "${software}"`);
// subdomain project id must exist in the system map
const projectId = (metaModule.match(/^([a-z0-9-]+\/[a-z0-9-]+)/) ?? [])[1];
if (projectId && !systemMap.includes(projectId))
  fail(`subdomain id "${projectId}" (%% module:) not found in context/system.map.md`);

// ---- 2. Subprocesses and steps vs process.txt ------------------------------
const procBlocks = blocks(processTxt);
if (tree.subprocess.length !== procBlocks.length)
  fail(`subprocess nodes: ${tree.subprocess.length} in tree, ${procBlocks.length} blocks in process.txt`);
// SP ids in labels match the block headers, in order
procBlocks.forEach((b, i) => {
  const spId = (b.split('\n')[0].match(/^SP-\d{2,}/) ?? [])[0];
  const node = tree.subprocess[i];
  if (spId && node && !node.label.includes(spId))
    fail(`subprocess node ${i + 1} "${node.label}" does not carry its id ${spId} (process.txt order)`);
});
// step ids: derive SP-XX-YY from process.txt local numbering
const expectedStepIds = [];
procBlocks.forEach((b, i) => {
  const xx = String(i + 1).padStart(2, '0');
  for (const m of b.matchAll(/^(\d{2,})\) /gm))
    expectedStepIds.push(`SP-${xx}-${m[1]}`);
});
const treeStepIds = tree.step.map((n) => (n.label.match(/^SP-\d{2,}-\d{2,}/) ?? [])[0]).filter(Boolean);
if (tree.step.length !== expectedStepIds.length)
  fail(`step nodes: ${tree.step.length} in tree, ${expectedStepIds.length} steps in process.txt`);
for (const id of expectedStepIds)
  if (!treeStepIds.includes(id)) fail(`step ${id} (process.txt) has no tree node carrying that id`);
for (const n of tree.step)
  if (!/^SP-\d{2,}-\d{2,} /.test(n.label)) fail(`step node "${n.label}" does not open with its SP-XX-YY id`);

// ---- 3. Operations vs bpmn.txt — oid by oid --------------------------------
const txtSections = blocks(bpmnTxt);
if (txtSections.length !== procBlocks.length)
  fail(`bpmn.txt has ${txtSections.length} sections, process.txt has ${procBlocks.length} blocks`);

// Top-level lines: standalone crud + logic. Composed (indented) lines: crud +
// logic reference + output. Outputs never appear top-level.
const txtOps = { crud: 0, logic: 0, inner: 0, innerOutput: 0, innerLogic: 0 };
const txtOids = new Set();
const txtLogicIds = new Set();
const txtInnerLogicIds = new Set();
const txtComposedByOid = {};
let currentLogicOid = null;
for (const line of bpmnTxt.split('\n')) {
  const innerM = line.match(/^  - (SP-\S+) (crud|logic|output):/);
  if (innerM) {
    if (innerM[2] === 'crud') txtOps.inner++;
    else if (innerM[2] === 'logic') {
      txtOps.innerLogic++;
      const kebab = (line.match(/logic:\s+([a-z0-9-]+)\s*$/) ?? [])[1];
      if (kebab) txtInnerLogicIds.add(kebab);
    } else txtOps.innerOutput++;
    txtOids.add(innerM[1]);
    if (currentLogicOid) txtComposedByOid[currentLogicOid]++;
    continue;
  }
  const top = line.match(/^- (SP-\S+) (crud|logic):/);
  if (!top) { currentLogicOid = null; continue; }
  txtOps[top[2]]++; txtOids.add(top[1]);
  if (top[2] === 'logic') {
    currentLogicOid = top[1];
    if (!(top[1] in txtComposedByOid)) txtComposedByOid[top[1]] = 0;
    const kebab = (line.match(/logic:\s+([a-z0-9-]+)\s*$/) ?? [])[1];
    if (kebab) txtLogicIds.add(kebab);
  } else currentLogicOid = null;
}
if (tree.crud.length !== txtOps.crud)
  fail(`standalone CRUD nodes: ${tree.crud.length} in tree, ${txtOps.crud} in bpmn.txt`);
if (tree.innerOutput.length !== txtOps.innerOutput)
  fail(`composed Output nodes: ${tree.innerOutput.length} in tree, ${txtOps.innerOutput} indented outputs in bpmn.txt`);
if (tree.logic.length !== txtOps.logic)
  fail(`logic nodes: ${tree.logic.length} in tree, ${txtOps.logic} logic lines in bpmn.txt`);
if (tree.inner.length !== txtOps.inner)
  fail(`composed CRUD nodes: ${tree.inner.length} in tree, ${txtOps.inner} indented cruds in bpmn.txt`);
if (tree.innerLogic.length !== txtOps.innerLogic)
  fail(`composed Logic reference nodes: ${tree.innerLogic.length} in tree, ${txtOps.innerLogic} indented logic lines in bpmn.txt`);

// every operation node carries an oid, and the oid sets match exactly
const treeOids = new Set();
for (const n of [...tree.crud, ...tree.logic, ...tree.inner, ...tree.innerOutput, ...tree.innerLogic]) {
  const oid = oidOf(n);
  if (!oid) { fail(`operation node "${n.label}" carries no oid (SP-XX-YY-[C|L|O]ZZ)`); continue; }
  treeOids.add(oid);
}
for (const oid of txtOids)
  if (!treeOids.has(oid)) fail(`oid ${oid} (bpmn.txt) has no tree node`);
for (const oid of treeOids)
  if (!txtOids.has(oid)) fail(`tree oid ${oid} does not exist in bpmn.txt`);

// ---- 4. Logic count across all sources -------------------------------------
const xmlLogicIds = new Set(
  [...bpmnXml.matchAll(/"type":"logic","oid":"[^"]*","id":"([a-z0-9-]+)"/g)].map((m) => m[1])
);
const sipocFileIds = new Set(sipocFiles.map((f) => f.replace(/\.md$/, '')));
const sipocTxtIds = new Set(
  [...sipocTxt.matchAll(/^\S.*\(([a-z0-9-]+)\)\s*$/gm)].map((m) => m[1])
);
// logic label: `⚙️ {oid} {kebab-id} [BR-NN]` — the kebab is the token after the oid
const treeLogicIds = new Set(
  tree.logic.map((n) => (n.label.match(/[CLO]\d{2,}\s+([a-z][a-z0-9]*(?:-[a-z0-9]+)+)/) ?? [])[1]).filter(Boolean)
);
const sets = {
  'bpmn.bpmn unique logic ids': xmlLogicIds,
  'bpmn.txt logic ids': txtLogicIds,
  'sipoc/ files': sipocFileIds,
  'sipoc.txt blocks': sipocTxtIds,
  'tree ⚙️ nodes': treeLogicIds,
};
const sizes = new Set(Object.values(sets).map((s) => s.size));
if (sizes.size !== 1)
  fail(`Logic count differs: ${Object.entries(sets).map(([k, s]) => `${k}=${s.size}`).join(', ')}`);
for (const [name, s] of Object.entries(sets))
  for (const id of xmlLogicIds)
    if (!s.has(id)) fail(`logic "${id}" missing from ${name}`);

// composed Logic references are reuses: every referenced id must be a Logic
// defined as its own node (bpmn.bpmn unique logic ids). Tree ⚙️ leaf refs too.
for (const id of txtInnerLogicIds)
  if (!xmlLogicIds.has(id)) fail(`composed logic reference "${id}" (bpmn.txt) is not a businessRuleTask logic id in bpmn.bpmn`);
for (const n of tree.innerLogic) {
  const kebab = (n.label.match(/[CLO]\d{2,}\s+([a-z][a-z0-9]*(?:-[a-z0-9]+)+)/) ?? [])[1];
  if (kebab && !xmlLogicIds.has(kebab))
    fail(`composed logic reference node "${n.label}" — "${kebab}" is not a businessRuleTask logic id in bpmn.bpmn`);
}

// per-logic composed count: tree inner children vs bpmn.txt (keyed by oid)
for (let i = 0; i < nodes.length; i++) {
  const n = nodes[i];
  if (!n.label.startsWith('⚙️')) continue;
  const oid = oidOf(n);
  let count = 0;
  for (let j = i + 1; j < nodes.length && nodes[j].depth > n.depth; j++) count++;
  if (oid && txtComposedByOid[oid] !== undefined && count !== txtComposedByOid[oid])
    fail(`logic ${oid}: ${count} composed CRUDs in tree, ${txtComposedByOid[oid]} in bpmn.txt`);
}

// ---- 5. Entities and rules exist in their sources --------------------------
const entities = new Set(dbmlTxt.split('\n').map((l) => l.trim()).filter(Boolean));
for (const n of [...tree.crud, ...tree.inner]) {
  // label: 📝 {oid} {action} {entity}
  const words = n.label.replace(/^📝\s*/, '').trim().split(/\s+/);
  const entity = (words[2] ?? '').split('.')[0];
  if (entity && !entities.has(entity))
    fail(`CRUD node "${n.label}" names entity "${entity}" not in dbml.txt`);
}
const brCited = new Set();
for (const n of tree.logic)
  for (const m of n.label.matchAll(/BR-\d+/g)) brCited.add(m[0]);
for (const br of brCited)
  if (!sipocAll.includes(br)) fail(`rule "${br}" cited in the tree is not defined in any sipoc/*.md`);

// ---- 6. Lineage metadata vs dbml.dbml stamps -------------------------------
const enumNames = new Set([...domainDbml.matchAll(/^Enum\s+(\S+)\s*\{/gm)].map((m) => m[1]));
const tableStamp = {}; // kebab id -> table name
for (const seg of domainDbml.split(/^(?=Table\s)/m).filter((s) => s.startsWith('Table'))) {
  const tname = (seg.match(/^Table\s+(\S+)/) ?? [])[1];
  const stamp = (seg.match(/Note:\s*'+\s*([a-z][a-z0-9-]*)\s+—/) ?? [])[1];
  if (tname && stamp) tableStamp[stamp] = tname;
}
if (Object.keys(tableStamp).length === 0)
  fail('no kebab-id stamps found in dbml.dbml Table Notes');

const metaById = Object.fromEntries(metaEntities.map((e) => [e.id, e]));
for (const [kebab, tname] of Object.entries(tableStamp)) {
  const e = metaById[kebab];
  if (!e) { fail(`lineage: stamped entity "${kebab}" (table ${tname}) has no %% entity: line`); continue; }
  if (e.table !== tname)
    fail(`lineage ${kebab}: table "${e.table}" ≠ stamped table "${tname}" in dbml.dbml`);
  for (const en of e.enums.split(',').map((s) => s.trim()).filter((s) => s && s !== '—'))
    if (!enumNames.has(en)) fail(`lineage ${kebab}: enum "${en}" not declared in dbml.dbml`);
}
for (const e of metaEntities)
  if (!tableStamp[e.id]) fail(`%% entity: line "${e.id}" has no stamped table in dbml.dbml`);

if (externalRefsMd) {
  const fence = (externalRefsMd.match(/```external-refs\n([\s\S]*?)```/) ?? [])[1] ?? '';
  for (const line of fence.split('\n')) {
    const m = line.match(/^([a-z0-9_-]+):\s*\S/);
    if (m && !metaExternals.includes(m[1]))
      fail(`external ref "ref:${m[1]}" (context/external-refs.md) has no %% external: line`);
  }
}

// ---- 7. ontology.txt mirrors the tree --------------------------------------
const outLines = outline.split('\n').filter((l) => l.trim() !== '');
const outCounts = {
  crud: outLines.filter((l) => / crud:/.test(l)).length,
  logic: outLines.filter((l) => / logic:/.test(l)).length,
  output: outLines.filter((l) => / output:/.test(l)).length,
};
const treeCrudTotal = tree.crud.length + tree.inner.length;
if (outCounts.crud !== treeCrudTotal)
  fail(`ontology.txt has ${outCounts.crud} crud lines, tree has ${treeCrudTotal} (standalone + composed)`);
const treeLogicTotal = tree.logic.length + tree.innerLogic.length;
if (outCounts.logic !== treeLogicTotal)
  fail(`ontology.txt has ${outCounts.logic} logic lines, tree has ${treeLogicTotal} (standalone + composed references)`);
if (outCounts.output !== tree.innerOutput.length)
  fail(`ontology.txt has ${outCounts.output} output lines, tree has ${tree.innerOutput.length} (all composed)`);
if (outLines.length !== nodes.length)
  fail(`ontology.txt has ${outLines.length} nodes, ontology.mmd has ${nodes.length} — the two views must mirror`);
// every tree oid appears in the outline too
for (const oid of treeOids)
  if (!outline.includes(oid)) fail(`oid ${oid} missing from ontology.txt`);

// ---- report ----------------------------------------------------------------
if (failures.length) {
  console.log('validate-ontology: FAIL');
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `validate-ontology: PASS — ${tree.subprocess.length} subprocesses, ${tree.step.length} steps, ` +
  `${tree.crud.length + tree.logic.length} standalone operations (${tree.logic.length} logic; ` +
  `${tree.inner.length} composed cruds, ${tree.innerLogic.length} composed logic refs, ` +
  `${tree.innerOutput.length} composed outputs), ` +
  `${brCited.size} rules, ${metaEntities.length} lineage entities`
);
process.exit(0);
