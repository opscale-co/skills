// skills/graph.mjs — opscale-graph JSON contract: the Plan CLOSER. Unlike the
// other four skills, opscale-graph is NON-INTERACTIVE and does not author its
// JSON — it reads the four sibling Plan phase files (process/dbml/bpmn/sipoc)
// and DETERMINISTICALLY BUILDS graph.json: a NESTED HIERARCHY of lightweight
// {id, ref} nodes (module → subprocesses → steps → operations → composed
// operations). Every element carries its ontology id and a JSON Pointer `ref`
// into the file that owns its content; nothing is duplicated.
// generate() builds + writes graph.json and projects the interactive,
// self-contained graph.html; validate() re-checks an on-disk graph.json
// (schema + hierarchy id consistency + ref resolution + counts parity),
// re-renders graph.html and confirms it is self-contained and matches disk.
//
// Everything heavy (ajv) resolves from the shared contract's own node_modules
// because this module lives under it.
import fs from 'node:fs';
import path from 'node:path';
import { compileSchema, readJson, Reporter } from '../validate.mjs';
import { render } from '../render/graph.mjs';

export const ARTIFACT = 'graph.json';
export const PROJECTION = 'graph.html';
const SCHEMA_REL = 'schema/graph.schema.json';
const SOURCES = ['process', 'dbml', 'bpmn', 'sipoc'];

// bpmn.json's `operations` is a nested map (subprocess code → step code →
// ordered op array). Flatten every step array to a first-level op list.
function flattenBpmnOps(bpmn) {
  const out = [];
  for (const steps of Object.values(bpmn.operations || {}))
    for (const arr of Object.values(steps))
      for (const op of arr) out.push(op);
  return out;
}
// Total composed members under an op, recursively (bpmn allows one level today).
const countComposed = (op) =>
  (op.operations || []).reduce((a, c) => a + 1 + countComposed(c), 0);

// ── sources ──────────────────────────────────────────────────────────────────
export function loadSources(planDir) {
  const sources = {};
  const missing = [];
  for (const n of SOURCES) {
    const p = path.join(planDir, `${n}.json`);
    if (!fs.existsSync(p)) missing.push(n);
    else sources[n] = readJson(p);
  }
  return { sources, missing };
}

// ── JSON Pointer (RFC 6901, array-aware) ──────────────────────────────────────
function resolvePointer(doc, pointer) {
  if (pointer === '' || pointer === '/') return doc;
  const parts = pointer.replace(/^\//, '').split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur = doc;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    const key = Array.isArray(cur) && /^\d+$/.test(p) ? Number(p) : p;
    cur = cur[key];
  }
  return cur;
}

// ── BUILD — assemble the nested graph.json from the four siblings ──────────────
export function buildGraph(planDir) {
  const { sources, missing } = loadSources(planDir);
  if (missing.length)
    throw new Error(`cannot build graph — missing sibling source(s): ${missing.map((m) => `${m}.json`).join(', ')}`);
  const { process: proc, bpmn } = sources;

  // One op node: {id, ref}, plus recursive `operations[]` for a logic op's
  // composed children (crud/output children carry no `operations`).
  const buildOp = (op, ptr) => {
    const node = { id: op.code, ref: ptr };
    const children = op.type === 'logic' ? op.operations || [] : [];
    if (children.length)
      node.operations = children.map((c, m) => buildOp(c, `${ptr}/operations/${m}`));
    return node;
  };

  const subprocesses = (proc.subprocesses || []).map((sp, i) => ({
    id: sp.code,
    ref: `process.json#/subprocesses/${i}`,
    steps: (sp.steps || []).map((st, j) => {
      const ops = (bpmn.operations?.[sp.code]?.[st.code]) || [];
      return {
        id: st.code,
        ref: `process.json#/subprocesses/${i}/steps/${j}`,
        operations: ops.map((op, k) => buildOp(op, `bpmn.json#/operations/${sp.code}/${st.code}/${k}`)),
      };
    }),
  }));

  return { module: { ref: 'process.json#/module' }, subprocesses };
}

// ── SEMANTIC — hierarchy id consistency + ref resolution + counts parity ───────
function semantic(graph, R, sources) {
  const { process: proc, dbml, bpmn, sipoc } = sources;
  const docFor = { process: proc, dbml, bpmn, sipoc };

  // (2) EVERY ref resolves in its named source file (dangling pointer = FAIL —
  // the "no island / everything points to something real" guarantee).
  let refs = 0;
  let dangling = 0;
  const checkRef = (ref, who) => {
    refs++;
    const m = String(ref || '').match(/^([a-z]+)\.json#(.*)$/);
    if (!m || !docFor[m[1]]) { R.fail(`${who}: ref "${ref}" names no sibling source`); dangling++; return; }
    if (resolvePointer(docFor[m[1]], m[2]) === undefined) {
      R.fail(`${who}: ref "${ref}" does not resolve (dangling JSON pointer)`);
      dangling++;
    }
  };
  const bpmnOf = (ref) => {
    const m = String(ref || '').match(/^bpmn\.json#(.*)$/);
    return m ? resolvePointer(bpmn, m[1]) : undefined;
  };

  checkRef(graph.module?.ref, 'module');

  // (1) hierarchy id consistency + counts, walking the nested tree.
  let spCount = 0;
  let stepCount = 0;
  let opCount = 0;
  let composedCount = 0;
  const logicIds = new Set();

  const walkComposed = (parent) => {
    for (const cm of parent.operations || []) {
      composedCount++;
      checkRef(cm.ref, `composed-operation ${cm.id}`);
      if (!String(cm.id).startsWith(`${parent.id}-`))
        R.fail(`composed-operation "${cm.id}" id is not prefixed by parent op "${parent.id}"`);
      walkComposed(cm);
    }
  };

  for (const sp of graph.subprocesses || []) {
    spCount++;
    checkRef(sp.ref, `subprocess ${sp.id}`);
    for (const st of sp.steps || []) {
      stepCount++;
      checkRef(st.ref, `step ${st.id}`);
      if (!String(st.id).startsWith(`${sp.id}-`))
        R.fail(`step "${st.id}" id is not prefixed by subprocess "${sp.id}"`);
      for (const op of st.operations || []) {
        opCount++;
        checkRef(op.ref, `operation ${op.id}`);
        if (!String(op.id).startsWith(`${st.id}-`))
          R.fail(`operation "${op.id}" id is not prefixed by step "${st.id}"`);
        const resolved = bpmnOf(op.ref);
        if (resolved && resolved.type === 'logic') logicIds.add(resolved.id);
        walkComposed(op);
      }
    }
  }
  if (!dangling) R.pass(`all ${refs} refs resolve in their owning source`);

  // (3) counts parity with the sources.
  const bops = flattenBpmnOps(bpmn);
  const srcSubs = (proc.subprocesses || []).length;
  const srcSteps = (proc.subprocesses || []).reduce((a, s) => a + (s.steps || []).length, 0);
  const srcOps = bops.length;
  const srcComposed = bops.reduce((a, o) => a + countComposed(o), 0);
  const parity = (label, got, want) => { if (got !== want) R.fail(`count ${label}: graph ${got} ≠ source ${want}`); };
  parity('subprocess', spCount, srcSubs);
  parity('step', stepCount, srcSteps);
  parity('operation', opCount, srcOps);
  parity('composed-operation', composedCount, srcComposed);

  const sipocIds = new Set((sipoc.sipocs || []).map((s) => s.id));
  const sameSet = logicIds.size === sipocIds.size && [...logicIds].every((x) => sipocIds.has(x));
  if (!sameSet) R.fail(`logic ids {${[...logicIds].join(', ')}} ≠ sipoc ids {${[...sipocIds].join(', ')}}`);

  if (!R.failures.length)
    R.pass(
      `counts parity: ${spCount} subprocess, ${stepCount} steps, ` +
      `${opCount} operations, ${composedCount} composed, ${logicIds.size} logic ↔ sipoc`
    );
}

// ── PROJECTION — assert the rendered graph.html is self-contained & well-formed ─
function assertSelfContained(html, R) {
  if (!html || !html.trim()) { R.fail(`${PROJECTION} is empty`); return; }
  const offenders = [];
  if (/https?:\/\//.test(html)) offenders.push('absolute http(s) URL');
  if (/<script\b[^>]*\bsrc\b/i.test(html)) offenders.push('<script src>');
  if (/<link\b/i.test(html)) offenders.push('<link>');
  if (/\bsrc\s*=/i.test(html)) offenders.push('src= attribute');
  if (/cdn/i.test(html)) offenders.push('cdn reference');
  if (offenders.length) R.fail(`${PROJECTION} is not self-contained: ${offenders.join(', ')}`);
  else R.pass(`${PROJECTION} is self-contained (no external/network references)`);
  if (!/class="card/.test(html)) R.fail(`${PROJECTION} has no card markup (class="card…")`);
  else R.pass(`${PROJECTION} contains the expected card markers`);
}

function schemaFor(skillDir) {
  return compileSchema(path.join(skillDir, SCHEMA_REL));
}

// ── GENERATE — build graph.json, then project graph.html ───────────────────────
export function generate({ planDir, skillDir }) {
  const R = new Reporter('generate-graph');
  const { sources, missing } = loadSources(planDir);
  if (missing.length) {
    for (const m of missing) R.fail(`missing sibling source ${m}.json — run /opscale-${m} first (it owns that artifact)`);
    R.finish();
  }
  const graph = buildGraph(planDir);
  const validate = schemaFor(skillDir);
  if (!R.schema(validate, graph, ARTIFACT)) R.finish();
  semantic(graph, R, sources);
  if (R.failures.length) R.finish();

  fs.writeFileSync(path.join(planDir, ARTIFACT), `${JSON.stringify(graph, null, 2)}\n`);
  const files = render(graph, sources);
  for (const [rel, content] of Object.entries(files)) fs.writeFileSync(path.join(planDir, rel), content);

  // The projection replaced graph.mmd and the retired opscale-ontology outputs
  // (ontology.mmd / ontology.txt) — remove any stale copies.
  for (const stale of ['graph.mmd', 'ontology.mmd', 'ontology.txt']) {
    const stalePath = path.join(planDir, stale);
    if (fs.existsSync(stalePath)) fs.rmSync(stalePath);
  }

  assertSelfContained(files[PROJECTION], R);
  if (!R.failures.length) {
    const total = graph.subprocesses.length;
    R.pass(`wrote ${ARTIFACT} (nested: ${total} subprocesses) and interactive ${PROJECTION}`);
  }
  R.finish();
}

// ── VALIDATE — re-check on-disk graph.json + confirm graph.html matches ─────────
export async function validate({ planDir, skillDir }) {
  const R = new Reporter('validate-graph');
  const jsonPath = path.join(planDir, ARTIFACT);
  if (!fs.existsSync(jsonPath)) { R.fail(`missing ${jsonPath} — run render-graph.mjs`); R.finish(); }
  const { sources, missing } = loadSources(planDir);
  if (missing.length) { for (const m of missing) R.fail(`missing sibling source ${m}.json`); R.finish(); }

  const graph = readJson(jsonPath);
  const check = schemaFor(skillDir);
  if (R.schema(check, graph, ARTIFACT)) semantic(graph, R, sources);

  if (!R.failures.length) {
    const html = render(graph, sources)[PROJECTION];
    assertSelfContained(html, R);
    const htmlPath = path.join(planDir, PROJECTION);
    if (!fs.existsSync(htmlPath)) R.warn(`${PROJECTION} not yet rendered`);
    else if (fs.readFileSync(htmlPath, 'utf8') !== html)
      R.fail(`${PROJECTION} on disk differs from the projection of graph.json — re-run render`);
    else R.pass(`${PROJECTION} matches the projection`);
  }
  R.finish();
}
