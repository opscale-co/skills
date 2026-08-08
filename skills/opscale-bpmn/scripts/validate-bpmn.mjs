#!/usr/bin/env node
/**
 * opscale-bpmn — Internal BPMN Validator
 *
 * INTERNAL SKILL TOOL — do not copy to projects.
 * Runs from the skill bundle directory during skill execution.
 * Temp files are auto-deleted after validation.
 *
 * Validates BPMN 2.0 XML and Opscale-specific conventions. The XML is
 * SELF-CONTAINED: every task's documentation JSON carries its business step
 * and subprocess; logic tasks also carry their governing rules and composed
 * CRUDs (what used to live in operations.md).
 *   - Only serviceTask (crud) and businessRuleTask (logic) nodes; no sendTask (Outputs are composed inside a Logic)
 *   - Every task has bpmn:documentation with valid JSON (key order: type, oid, then id/entity/content)
 *   - serviceTask JSON: {"type":"crud","entity","action","step","subprocess"}
 *   - businessRuleTask JSON: {"type":"logic","id","step","subprocess","rules":[…],"composed":[{entity,action},…]}
 *   - Output = composed member of a Logic: {"oid","content"} (no channel, no node)
 *   - <bpmn:process> carries {"module","standard"} documentation
 *   - A logic id reused across nodes carries identical JSON in every node
 *   - action must be create|read|update|delete; logic id kebab-case
 *   - Gateway branches must be labelled; BPMNDiagram present; start/end present
 *   - With --txt=docs/plan/bpmn.txt --process=docs/plan/process.txt: bpmn.txt
 *     sections match the process.txt subprocess blocks (count + names)
 *
 * Usage:
 *   node validate-bpmn.mjs <path-to-file.bpmn> [--txt=docs/plan/bpmn.txt] [--process=docs/plan/process.txt]
 *
 * Exit codes:
 *   0 — PASS
 *   1 — FAIL: XML parse error or forbidden element (do not write output)
 *   2 — REVIEW: valid structure but quality warnings (fix before writing)
 *
 * Requirements:
 *   Dependencies are bundled in this skill's node_modules — never install at runtime.
 */

import { readFileSync, unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';

const posArgs  = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags    = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith('--'))
    .map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.slice(2), true]; })
);
const filePath = posArgs[0];
if (!filePath) {
  console.error('❌  Usage: node validate-bpmn.mjs <path-to-file.bpmn> [--txt=docs/plan/bpmn.txt] [--process=docs/plan/process.txt]');
  process.exit(1);
}

const absolutePath = resolve(filePath);
const isTmp = filePath.includes('.tmp.');

let raw;
try {
  raw = readFileSync(absolutePath, 'utf-8');
} catch (err) {
  console.error(`❌  Cannot read file: ${filePath}\n    ${err.message}`);
  process.exit(1);
}

// Accept either raw .bpmn or a markdown file with a ```xml ... ``` fenced block
// (older opscale-bpmn drafts wrapped the XML in such a block).
let xml;
if (filePath.endsWith('.bpmn')) {
  xml = raw;
} else {
  const block = raw.match(/```xml\n([\s\S]*?)\n```/);
  xml = block ? block[1] : raw; // fall back to raw if no fence found
}

console.log(`\n📄  File  : ${filePath}${isTmp ? ' (draft)' : ''}\n`);

// ── Parse XML manually using regex-based checks ─────────────────────────────
// bpmnlint requires config files; for skill-internal use we do structural checks
// plus Opscale-specific JSON validation directly on the XML string.

const warnings = [];
const errors   = [];

// ── 1. Basic XML structure ───────────────────────────────────────────────────

if (!xml.includes('<bpmn:definitions')) {
  errors.push('Missing <bpmn:definitions> root element');
}
if (!xml.includes('<bpmn:process')) {
  errors.push('Missing <bpmn:process> element');
}
if (!xml.includes('<bpmndi:BPMNDiagram')) {
  errors.push('Missing <bpmndi:BPMNDiagram> section — required for bpmn.io import');
}

if (errors.length > 0) {
  console.error('❌  BPMN structure errors — file will NOT be written\n');
  errors.forEach(e => console.error(`    ✗ ${e}`));
  console.log('\n────────────────────────────────────────────────────────────');
  console.log('❌  FAIL (exit 1) — fix structure and re-run\n');
  if (isTmp) cleanup(absolutePath);
  process.exit(1);
}

// ── 2. Forbidden task types ──────────────────────────────────────────────────

const forbidden = [
  'bpmn:userTask', 'bpmn:manualTask', 'bpmn:receiveTask',
  'bpmn:scriptTask', 'bpmn:callActivity', 'bpmn:subProcess',
  // sendTask is forbidden: Outputs are composed members of a Logic, not nodes.
  'bpmn:sendTask',
];
forbidden.forEach(tag => {
  const re = new RegExp(`<${tag}[\\s>]`, 'gi');
  if (re.test(xml)) {
    const extra = tag === 'bpmn:sendTask'
      ? ' — Outputs are composed inside a Logic (its "composed" array), never a node'
      : ' — only serviceTask (crud) and businessRuleTask (logic) nodes are allowed';
    errors.push(`Forbidden element <${tag}> found${extra}`);
  }
});

if (errors.length > 0) {
  console.error('❌  Forbidden BPMN elements found — file will NOT be written\n');
  errors.forEach(e => console.error(`    ✗ ${e}`));
  console.log('\n────────────────────────────────────────────────────────────');
  console.log('❌  FAIL (exit 1)\n');
  if (isTmp) cleanup(absolutePath);
  process.exit(1);
}

// ── 3. Parse tasks and validate JSON metadata ────────────────────────────────

const VALID_ACTIONS  = new Set(['create', 'read', 'update', 'delete']);
const KEBAB_RE       = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const OID_RE         = { crud: /^SP-\d{2,}-\d{2,}-C\d{2,}$/, logic: /^SP-\d{2,}-\d{2,}-L\d{2,}$/, output: /^SP-\d{2,}-\d{2,}-O\d{2,}$/ };

// oid uniqueness across the module: same oid may repeat only on reused Logic
// nodes carrying identical JSON (checked separately via logicJsonById).
const seenOids = new Map(); // oid -> canonical JSON
function checkOid(taskId, meta, kind) {
  if (!meta.oid) {
    warnings.push(`[${taskId}] missing "oid" — every operation carries its ontology id SP-XX-YY-[C|L|O]ZZ`);
    return;
  }
  if (!OID_RE[kind].test(meta.oid)) {
    warnings.push(`[${taskId}] oid "${meta.oid}" malformed — expected SP-XX-YY-${kind === 'crud' ? 'C' : kind === 'logic' ? 'L' : 'O'}ZZ`);
    return;
  }
  const canon = JSON.stringify(meta);
  if (seenOids.has(meta.oid) && seenOids.get(meta.oid) !== canon)
    warnings.push(`[${taskId}] oid "${meta.oid}" reused with different metadata — oids are unique per operation`);
  seenOids.set(meta.oid, canon);
}

// Extract tasks by type
const serviceTasks     = [...xml.matchAll(/<bpmn:serviceTask\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/bpmn:serviceTask>/gi)];
const businessRuleTasks = [...xml.matchAll(/<bpmn:businessRuleTask\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/bpmn:businessRuleTask>/gi)];

let totalTasks = serviceTasks.length + businessRuleTasks.length;

// ── Validate serviceTask (crud) ───────────────────────────────────────────
serviceTasks.forEach(match => {
  const id = match[1];
  const body = match[2];
  const docMatch = body.match(/<bpmn:documentation>(.*?)<\/bpmn:documentation>/s);

  if (!docMatch) {
    warnings.push(`[${id}] serviceTask missing <bpmn:documentation>`);
    return;
  }
  let meta;
  try { meta = JSON.parse(docMatch[1].trim()); }
  catch { warnings.push(`[${id}] serviceTask documentation is not valid JSON: ${docMatch[1].trim()}`); return; }

  if (meta.type !== 'crud')
    warnings.push(`[${id}] serviceTask must have "type":"crud", found "${meta.type}"`);
  if (!meta.entity)
    warnings.push(`[${id}] serviceTask (crud) missing "entity"`);
  if (!meta.action)
    warnings.push(`[${id}] serviceTask (crud) missing "action"`);
  else if (!VALID_ACTIONS.has(meta.action))
    warnings.push(`[${id}] serviceTask action "${meta.action}" invalid — must be create|read|update|delete`);
  if (!meta.step || !meta.subprocess)
    warnings.push(`[${id}] serviceTask missing "step"/"subprocess" — the XML is self-contained; every task carries its business step and subprocess`);
  checkOid(id, meta, 'crud');
});

// ── Validate businessRuleTask (logic) ─────────────────────────────────────
const logicJsonById = new Map();
businessRuleTasks.forEach(match => {
  const id = match[1];
  const body = match[2];
  const docMatch = body.match(/<bpmn:documentation>(.*?)<\/bpmn:documentation>/s);

  if (!docMatch) {
    warnings.push(`[${id}] businessRuleTask missing <bpmn:documentation>`);
    return;
  }
  let meta;
  try { meta = JSON.parse(docMatch[1].trim()); }
  catch { warnings.push(`[${id}] businessRuleTask documentation is not valid JSON: ${docMatch[1].trim()}`); return; }

  if (meta.type !== 'logic')
    warnings.push(`[${id}] businessRuleTask must have "type":"logic", found "${meta.type}"`);
  if (!meta.id)
    warnings.push(`[${id}] businessRuleTask missing "id"`);
  else if (!KEBAB_RE.test(meta.id))
    warnings.push(`[${id}] businessRuleTask logic id "${meta.id}" is not kebab-case`);
  if (!meta.step || !meta.subprocess)
    warnings.push(`[${id}] businessRuleTask missing "step"/"subprocess"`);
  if (!Array.isArray(meta.rules) || meta.rules.length === 0)
    warnings.push(`[${id}] businessRuleTask missing "rules" — a Logic exists because a rule forces its CRUDs to run together; state it in prose`);
  checkOid(id, meta, 'logic');
  if (!Array.isArray(meta.composed) || meta.composed.length === 0) {
    warnings.push(`[${id}] businessRuleTask missing "composed" — a zero-CRUD Logic is suspicious; list its composed CRUDs/Outputs [{oid,entity,action}|{oid,content},…]`);
  } else {
    const hasCrud = meta.composed.some(c => c.entity && VALID_ACTIONS.has(c.action));
    if (!hasCrud)
      warnings.push(`[${id}] businessRuleTask "composed" has no CRUD — a Logic with only Outputs is suspicious; a notification is the effect of a data change, so the change belongs here too`);
    meta.composed.forEach((c, i) => {
      const isOutput = c.content !== undefined && c.entity === undefined && c.action === undefined;
      const isCrud = c.entity !== undefined || c.action !== undefined;
      if (isOutput) {
        if (!c.content)
          warnings.push(`[${id}] composed[${i}] output missing "content" — a brief phrase for WHAT leaves the system (no channel)`);
        if (c.channel)
          warnings.push(`[${id}] composed[${i}] output carries "channel" — record only the content (channel is a Generate-phase decision)`);
      } else if (isCrud) {
        if (!c.entity || !VALID_ACTIONS.has(c.action))
          warnings.push(`[${id}] composed[${i}] crud invalid — needs "entity" and a create|read|update|delete "action"`);
      } else {
        warnings.push(`[${id}] composed[${i}] is neither a CRUD ({oid,entity,action}) nor an Output ({oid,content})`);
      }
      if (!c.oid)
        warnings.push(`[${id}] composed[${i}] missing "oid" — nested form SP-XX-YY-LZZ-[C|L|O]AA`);
      else if (meta.oid && (!c.oid.startsWith(`${meta.oid}-`) || !/-[CLO]\d{2,}$/.test(c.oid)))
        warnings.push(`[${id}] composed[${i}] oid "${c.oid}" must extend its Logic's oid ("${meta.oid}-[C|L|O]AA")`);
    });
  }
  if (meta.id) {
    const canon = JSON.stringify(meta);
    if (logicJsonById.has(meta.id) && logicJsonById.get(meta.id) !== canon)
      warnings.push(`[${id}] logic id "${meta.id}" reused with DIFFERENT metadata — reused ids must carry identical JSON in every node`);
    logicJsonById.set(meta.id, canon);
  }
});

// sendTask nodes are forbidden (handled in the forbidden-elements check above);
// Outputs are validated as composed members of each Logic.

// ── Process-level documentation (module + modeling standard) ──────────────
{
  const procDoc = xml.match(/<bpmn:process\b[^>]*>\s*<bpmn:documentation>(.*?)<\/bpmn:documentation>/s);
  if (!procDoc) {
    warnings.push('<bpmn:process> missing its <bpmn:documentation> with {"module","standard"} — the XML must be self-contained');
  } else {
    try {
      const p = JSON.parse(procDoc[1].trim());
      if (!p.module) warnings.push('process documentation missing "module"');
      if (!p.standard) warnings.push('process documentation missing "standard" (use "none" if none was chosen)');
    } catch {
      warnings.push(`process documentation is not valid JSON: ${procDoc[1].trim().slice(0, 60)}`);
    }
  }
}

// ── 4. Start and end events ──────────────────────────────────────────────────

if (!xml.includes('<bpmn:startEvent'))
  warnings.push('Missing start event');

if (!xml.includes('<bpmn:endEvent'))
  warnings.push('Missing end event');

// ── 5. Gateway branch labels ─────────────────────────────────────────────────
// Capture the FULL <bpmn:sequenceFlow .../> element so `name=` placed before
// `sourceRef=` is detected. Previous implementation only inspected the slice
// starting at `sourceRef=`, producing false positives for every well-labelled
// flow whose name appeared earlier in the attribute list.

const gatewayIds = [...xml.matchAll(/<bpmn:exclusiveGateway\s+id="([^"]+)"/gi)].map(m => m[1]);
gatewayIds.forEach(gwId => {
  const allFlows = [...xml.matchAll(/<bpmn:sequenceFlow\b[^>]*\/?>/gi)].map(m => m[0]);
  const outgoing = allFlows.filter(f => f.includes(`sourceRef="${gwId}"`));
  outgoing.forEach((flow, i) => {
    if (!/\bname="/.test(flow))
      warnings.push(`Gateway [${gwId}] — outgoing flow ${i + 1} has no label (must describe condition)`);
  });
});

// ── 6. BPMNDiagram coverage ──────────────────────────────────────────────────

// Count semantic elements vs shapes
const semanticCount = totalTasks
  + (xml.match(/<bpmn:startEvent/gi) || []).length
  + (xml.match(/<bpmn:endEvent/gi) || []).length
  + (xml.match(/<bpmn:exclusiveGateway/gi) || []).length
  + (xml.match(/<bpmn:parallelGateway/gi) || []).length;

const shapeCount = (xml.match(/<bpmndi:BPMNShape/gi) || []).length;
const edgeCount  = (xml.match(/<bpmndi:BPMNEdge/gi) || []).length;
const flowCount  = (xml.match(/<bpmn:sequenceFlow/gi) || []).length;

if (shapeCount < semanticCount)
  warnings.push(`BPMNDiagram has ${shapeCount} shapes but ${semanticCount} semantic elements — some elements lack visual representation`);

if (edgeCount < flowCount)
  warnings.push(`BPMNDiagram has ${edgeCount} edges but ${flowCount} sequence flows — some flows lack visual representation`);

// ── 6b. bpmn.txt ↔ process.txt cross-check (optional flags) ──────────────────
// bpmn.txt: one section per subprocess (blank-line separated); first line is
// the subprocess name. Top-level op lines are only standalone crud and logic;
// each `- logic:` carries its composed members (crud AND output) indented.
// Outputs never appear as top-level lines.

if (flags.txt) {
  if (!existsSync(flags.txt)) {
    warnings.push(`bpmn.txt not found at ${flags.txt}`);
  } else {
    const txt = readFileSync(resolve(flags.txt), 'utf-8');
    const sections = txt.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    const sectionNames = sections.map(s => s.split('\n')[0].trim());

    if (flags.process && existsSync(flags.process)) {
      const proc = readFileSync(resolve(flags.process), 'utf-8');
      const blocks = proc.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
      const blockNames = blocks.map(b => b.split('\n')[0].trim());
      if (sectionNames.length !== blockNames.length)
        warnings.push(`bpmn.txt has ${sectionNames.length} sections, process.txt has ${blockNames.length} subprocess blocks — must match 1:1`);
      blockNames.forEach(n => {
        if (!sectionNames.includes(n))
          warnings.push(`process.txt subprocess "${n}" has no section in bpmn.txt (same names, same order)`);
      });
    }

    // op lines carry their oid and are CONCISE: crud = `{action} {entity}`,
    // logic = bare kebab id, output = brief content (no channel). Nested cruds
    // indented with the extended oid. Every logic line has ≥1 composed line.
    const lines = txt.split('\n');
    const CRUD_LINE = /crud:\s+(create|read|update|delete)\s+[a-z][a-z0-9_]*\s*$/;
    lines.forEach((l, i) => {
      // Top-level operation lines: only standalone crud or logic — never output.
      if (/^- /.test(l) && !/^- SP-\d{2,}-\d{2,}-[CL]\d{2,} (crud|logic):/.test(l)) {
        if (/^- SP-\d{2,}-\d{2,}-O\d{2,} output:/.test(l) || /^- \S+ output:/.test(l))
          warnings.push(`bpmn.txt: "${l.trim().slice(0, 60)}" — Outputs are never top-level; compose them inside a Logic (indented "  - {parent-oid}-OAA output: …")`);
        else
          warnings.push(`bpmn.txt: "${l.trim().slice(0, 60)}" — top-level op lines are "- {oid} crud|logic: …" (oid SP-XX-YY-[C|L]ZZ)`);
      }
      // Composed (indented) lines: crud or output, with a nested oid.
      if (/^  - /.test(l) && !/^  - SP-\d{2,}-\d{2,}-[CLO]\d{2,}-[CLO]\d{2,} (crud|output):/.test(l))
        warnings.push(`bpmn.txt: "${l.trim().slice(0, 60)}" — composed lines are "  - {parent-oid}-[C|L|O]AA crud|output: …"`);
      if (/^  - \S+ crud:/.test(l) && !CRUD_LINE.test(l))
        warnings.push(`bpmn.txt: "${l.trim().slice(0, 60)}" — crud lines are "{action} {entity}" only (no parentheses, no column/status detail; that lives in the SIPOC)`);
      if (/^  - \S+ output:/.test(l) && /output:.*\b(email|sms|whatsapp|push|webhook|pdf|dashboard|correo)\b/i.test(l))
        warnings.push(`bpmn.txt: "${l.trim().slice(0, 60)}" — output lines describe WHAT leaves (brief content), never the channel`);
      if (/^- \S+ logic:/.test(l) && !/logic:\s+[a-z][a-z0-9]*(-[a-z0-9]+)*\s*$/.test(l))
        warnings.push(`bpmn.txt: "${l.trim().slice(0, 60)}" — logic lines carry ONLY the kebab Action id (no natural name, no parentheses)`);
      if (/^- \S+ logic:/.test(l) && !(lines[i + 1] ?? '').startsWith('  - '))
        warnings.push(`bpmn.txt: "${l.trim().slice(0, 60)}" has no indented composed members beneath it`);
    });
  }
}

// ── 7. Report ────────────────────────────────────────────────────────────────

console.log('✅  BPMN XML structure valid\n');
console.log('── Model Summary ───────────────────────────────────────────');
console.log(`   serviceTask  (crud)   : ${serviceTasks.length}`);
console.log(`   businessRuleTask (logic): ${businessRuleTasks.length}`);
console.log(`   Total tasks             : ${totalTasks}`);
console.log(`   Gateways                : ${gatewayIds.length}`);
console.log(`   BPMNDiagram shapes      : ${shapeCount}`);
console.log(`   BPMNDiagram edges       : ${edgeCount}`);

console.log('\n── Quality Checks ──────────────────────────────────────────');

if (warnings.length > 0) {
  warnings.forEach(w => console.log(`   ⚠️   ${w}`));
  console.log(`\n   ${warnings.length} warning(s) found`);
  console.log('\n────────────────────────────────────────────────────────────');
  console.log('⚠️   REVIEW (exit 2) — fix warnings before writing docs/plan/bpmn.bpmn\n');
  if (isTmp) cleanup(absolutePath);
  process.exit(2);
}

console.log('   ✅  Only serviceTask + businessRuleTask nodes (no sendTask; Outputs composed)');
console.log('   ✅  All tasks have valid bpmn:documentation JSON (self-contained: step + subprocess)');
console.log('   ✅  Logic tasks carry rules + composed CRUDs; process carries module + standard');
console.log('   ✅  serviceTask (crud): entities and actions valid');
console.log('   ✅  businessRuleTask (logic): ids are kebab-case');
console.log('   ✅  Outputs composed inside their Logic (content only, no channel)');
console.log('   ✅  Gateway branches are labelled');
console.log('   ✅  Start and end events present');
console.log('   ✅  BPMNDiagram covers all semantic elements');
console.log('\n────────────────────────────────────────────────────────────');
console.log('✅  PASS (exit 0) — BPMN is valid, write docs/plan/bpmn.bpmn\n');
if (isTmp) cleanup(absolutePath);
process.exit(0);

function cleanup(path) {
  try { if (existsSync(path)) unlinkSync(path); } catch { /* ignore */ }
}
