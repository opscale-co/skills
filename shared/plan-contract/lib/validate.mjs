#!/usr/bin/env node
// validate.mjs — shared Plan-contract validation core.
//
// Everything the per-skill validators need that is NOT skill-specific:
//   • an ajv (draft 2020-12) factory pre-loaded with common.schema.json so skill
//     schemas can $ref it by $id;
//   • the two Mermaid syntax linters (flowchart + treeView), lifted verbatim
//     from the pre-refactor validate-process.mjs / validate-ontology.mjs so a
//     rendered diagram is proven to actually render;
//   • a Reporter with the repo-standard exit codes (0 pass / 1 fail / 2 review);
//   • small helpers (readJson, slugify, sequential-code checks).
//
// Skill-specific rules + rendering live in lib/skills/<name>.mjs and lib/render/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CONTRACT_DIR = path.join(HERE, '..');
export const COMMON_SCHEMA_PATH = path.join(CONTRACT_DIR, 'schema', 'common.schema.json');

export function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ── ajv factory ─────────────────────────────────────────────────────────────
// Returns a compiled validate(data) for `skillSchema` (object or path), with
// common.schema.json registered so `$ref`s to its $id resolve.
export function compileSchema(skillSchema) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(readJson(COMMON_SCHEMA_PATH));
  const schema = typeof skillSchema === 'string' ? readJson(skillSchema) : skillSchema;
  return ajv.compile(schema);
}

// Human-readable ajv error lines (instancePath + message + allowed values).
export function formatAjvErrors(errors) {
  return (errors || []).map((e) => {
    const where = e.instancePath || '(root)';
    let msg = `${where} ${e.message}`;
    if (e.params && e.params.allowedValues) msg += ` [${e.params.allowedValues.join(', ')}]`;
    else if (e.params && e.params.allowedValue !== undefined) msg += ` [${e.params.allowedValue}]`;
    else if (e.params && e.params.additionalProperty) msg += ` ("${e.params.additionalProperty}")`;
    return msg;
  });
}

// ── Mermaid syntax linter — flowchart ────────────────────────────────────────
const FLOW_ARROWS = /(<-->|-->|---|-\.->|-\.-|==>|===|--x|--o|o--o|x--x)/;
export function lintMermaidFlowchart(mmd) {
  const errs = [];
  const lines = mmd.split('\n');
  const firstReal = lines.find((l) => l.trim() && !l.trim().startsWith('%%'));
  if (!firstReal || !/^\s*flowchart\s+(TD|TB|BT|RL|LR)\s*$/.test(firstReal))
    errs.push(`first statement must be a "flowchart TD" header (found "${(firstReal || '').trim().slice(0, 30)}")`);

  const validId = (tok) => /^[A-Za-z][A-Za-z0-9_]*$/.test(tok);
  const idOf = (ref) => ref.replace(/(\(\[.*\]\)|\[.*\]|\{.*\}|\(.*\))$/s, '').trim();

  let depth = 0;
  lines.forEach((line, i) => {
    const ln = i + 1;
    const t = line.trim();
    if (!t || t.startsWith('%%') || /^flowchart\s/.test(t)) return;

    if (((t.match(/"/g) || []).length) % 2 !== 0)
      errs.push(`line ${ln}: unbalanced double-quote — "${t.slice(0, 40)}"`);
    const outside = t.replace(/"[^"]*"/g, '');
    for (const [o, c, name] of [['[', ']', 'square'], ['{', '}', 'curly'], ['(', ')', 'round']]) {
      if ((outside.split(o).length - 1) !== (outside.split(c).length - 1))
        errs.push(`line ${ln}: unbalanced ${name} bracket — "${t.slice(0, 40)}"`);
    }

    if (/^subgraph\b/.test(t)) {
      depth++;
      if (!/^subgraph\s+[A-Za-z][A-Za-z0-9_]*(\s+\[".*"\])?\s*$/.test(t))
        errs.push(`line ${ln}: subgraph header must be \`subgraph {id} ["title"]\` — "${t.slice(0, 40)}"`);
      return;
    }
    if (t === 'end') { depth--; if (depth < 0) errs.push(`line ${ln}: "end" without an open subgraph`); return; }

    const masked = t.replace(/"[^"]*"/g, '"L"')
      .replace(/--\s+[^|>][^\n]*?\s+(-->|---|-\.->|==>)/g, ' $1 ')
      .replace(/(-->|---|-\.->|==>|--x|--o)\s*\|[^|]*\|/g, '$1 ');
    if (FLOW_ARROWS.test(masked)) {
      const endpoints = masked
        .split(FLOW_ARROWS)
        .filter((seg) => !FLOW_ARROWS.test(seg) && seg.trim())
        .map((seg) => seg.trim())
        .filter(Boolean);
      for (const ep of endpoints) {
        const id = idOf(ep);
        if (!validId(id)) errs.push(`line ${ln}: "${id}" is not a valid node id — "${t.slice(0, 40)}"`);
      }
    } else {
      const id = idOf(masked);
      if (!validId(id)) errs.push(`line ${ln}: node id "${id}" is invalid, or not a node/edge — "${t.slice(0, 40)}"`);
    }
  });
  if (depth > 0) errs.push(`${depth} subgraph(s) not closed with "end"`);
  return errs;
}

// ── Mermaid syntax linter — treeView ─────────────────────────────────────────
export function lintMermaidTreeView(text) {
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
      errs.push(`line ${ln}: indentation (${lead}) is not a multiple of ${unit}`);
    const depth = Math.round(lead / unit);
    if (idx > 0 && depth > prevDepth + 1)
      errs.push(`line ${ln}: indentation jumps ${depth - prevDepth} levels at once`);
    prevDepth = depth;

    const body = l.trim();
    if (((body.match(/"/g) || []).length) % 2 !== 0)
      errs.push(`line ${ln}: unbalanced double-quote — "${body.slice(0, 40)}"`);
    if (!/^"[^"]*"\/?(\s*:::[A-Za-z0-9_-]+)?(\s*##\s+\S.*)?\s*$/.test(body))
      errs.push(`line ${ln}: node must be a quoted label, optional trailing "/" — "${body.slice(0, 40)}"`);

    const next = nodeLines[idx + 1];
    if (next) {
      const nextDepth = Math.round(next.l.match(/^(\s*)/)[1].length / unit);
      const hasSlash = /^"[^"]*"\//.test(body);
      if (nextDepth > depth && !hasSlash)
        errs.push(`line ${ln}: "${body.slice(0, 30)}" has children — label must end with "/"`);
    }
  });
  return errs;
}

// ── helpers ──────────────────────────────────────────────────────────────────
export function slugify(name) {
  return String(name).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Verify an ordered list of codes is exactly prefix-01, prefix-02, … (two-digit).
export function sequential(codes, make) {
  const errs = [];
  codes.forEach((code, i) => {
    const expected = make(i + 1);
    if (code !== expected) errs.push(`code "${code}" out of sequence — expected "${expected}"`);
  });
  return errs;
}

// ── Reporter ─────────────────────────────────────────────────────────────────
// passes → PASS lines; failures → FAIL (exit 1); warnings → REVIEW (exit 2).
export class Reporter {
  constructor(name) { this.name = name; this.passes = []; this.failures = []; this.warnings = []; }
  pass(m) { this.passes.push(m); return this; }
  fail(m) { this.failures.push(m); return this; }
  warn(m) { this.warnings.push(m); return this; }
  schema(validate, data, label = 'schema') {
    if (validate(data)) { this.pass(`${label} valid`); return true; }
    for (const e of formatAjvErrors(validate.errors)) this.fail(`${label}: ${e}`);
    return false;
  }
  finish() {
    for (const p of this.passes) console.log(`PASS — ${p}`);
    for (const w of this.warnings) console.log(`REVIEW — ${w}`);
    for (const f of this.failures) console.log(`FAIL — ${f}`);
    if (this.failures.length) { console.log(`${this.name}: FAIL (${this.failures.length})`); process.exit(1); }
    if (this.warnings.length) { console.log(`${this.name}: REVIEW (${this.warnings.length})`); process.exit(2); }
    console.log(`${this.name}: PASS`);
    process.exit(0);
  }
}
