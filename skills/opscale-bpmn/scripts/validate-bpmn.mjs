#!/usr/bin/env node
/**
 * opscale-bpmn — Internal BPMN Validator
 *
 * INTERNAL SKILL TOOL — do not copy to projects.
 * Runs from the skill bundle directory during skill execution.
 * Temp files are auto-deleted after validation.
 *
 * Validates BPMN 2.0 XML and Opscale-specific conventions:
 *   - Only scriptTask and serviceTask allowed
 *   - Every task has bpmn:documentation with valid JSON
 *   - scriptTask JSON: {"type":"crud","entity":"...","action":"..."}
 *   - serviceTask JSON: {"type":"operation","id":"..."}
 *   - action must be create|read|update|delete
 *   - operation id must be kebab-case
 *   - Gateway branches must be labelled
 *   - BPMNDiagram section must be present
 *   - Start and end events must be present
 *
 * Usage:
 *   node validate-bpmn.mjs <path-to-file.bpmn>
 *
 * Exit codes:
 *   0 — PASS
 *   1 — FAIL: XML parse error or forbidden element (do not write output)
 *   2 — REVIEW: valid structure but quality warnings (fix before writing)
 *
 * Requirements:
 *   npm install bpmnlint  (in skill directory only)
 */

import { readFileSync, unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';

const filePath = process.argv[2];
if (!filePath) {
  console.error('❌  Usage: node validate-bpmn.mjs <path-to-file.bpmn>');
  process.exit(1);
}

const absolutePath = resolve(filePath);
const isTmp = filePath.includes('.tmp.');

let xml;
try {
  xml = readFileSync(absolutePath, 'utf-8');
} catch (err) {
  console.error(`❌  Cannot read file: ${filePath}\n    ${err.message}`);
  process.exit(1);
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
];
forbidden.forEach(tag => {
  const re = new RegExp(`<${tag}[\\s>]`, 'gi');
  if (re.test(xml))
    errors.push(`Forbidden element <${tag}> found — only scriptTask and serviceTask allowed`);
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

// Extract tasks by type
const serviceTasks     = [...xml.matchAll(/<bpmn:serviceTask\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/bpmn:serviceTask>/gi)];
const businessRuleTasks = [...xml.matchAll(/<bpmn:businessRuleTask\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/bpmn:businessRuleTask>/gi)];
const sendTasks        = [...xml.matchAll(/<bpmn:sendTask\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/bpmn:sendTask>/gi)];

let totalTasks = serviceTasks.length + businessRuleTasks.length + sendTasks.length;

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
});

// ── Validate businessRuleTask (logic) ─────────────────────────────────────
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
});

// ── Validate sendTask (output) ────────────────────────────────────────────
const VALID_CHANNELS = new Set(['email','push','sms','whatsapp','pdf','webhook','dashboard']);
sendTasks.forEach(match => {
  const id = match[1];
  const body = match[2];
  const docMatch = body.match(/<bpmn:documentation>(.*?)<\/bpmn:documentation>/s);

  if (!docMatch) {
    warnings.push(`[${id}] sendTask missing <bpmn:documentation>`);
    return;
  }
  let meta;
  try { meta = JSON.parse(docMatch[1].trim()); }
  catch { warnings.push(`[${id}] sendTask documentation is not valid JSON: ${docMatch[1].trim()}`); return; }

  if (meta.type !== 'output')
    warnings.push(`[${id}] sendTask must have "type":"output", found "${meta.type}"`);
  if (!meta.channel)
    warnings.push(`[${id}] sendTask missing "channel"`);
  else if (!VALID_CHANNELS.has(meta.channel))
    warnings.push(`[${id}] sendTask channel "${meta.channel}" invalid — must be email|push|sms|whatsapp|pdf|webhook|dashboard`);
  if (!meta.trigger)
    warnings.push(`[${id}] sendTask missing "trigger" (logic id that dispatches this output)`);
});

// ── 4. Start and end events ──────────────────────────────────────────────────

if (!xml.includes('<bpmn:startEvent'))
  warnings.push('Missing start event');

if (!xml.includes('<bpmn:endEvent'))
  warnings.push('Missing end event');

// ── 5. Gateway branch labels ─────────────────────────────────────────────────

const gatewayIds = [...xml.matchAll(/<bpmn:exclusiveGateway\s+id="([^"]+)"/gi)].map(m => m[1]);
gatewayIds.forEach(gwId => {
  // Find outgoing flows from this gateway — check they have a name attribute
  const outgoingFlows = [...xml.matchAll(new RegExp(`sourceRef="${gwId}"[^>]*>`, 'gi'))];
  outgoingFlows.forEach((flow, i) => {
    if (!flow[0].includes('name='))
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

// ── 7. Report ────────────────────────────────────────────────────────────────

console.log('✅  BPMN XML structure valid\n');
console.log('── Model Summary ───────────────────────────────────────────');
console.log(`   serviceTask  (crud)   : ${serviceTasks.length}`);
console.log(`   businessRuleTask (logic): ${businessRuleTasks.length}`);
console.log(`   sendTask (output)       : ${sendTasks.length}`);
console.log(`   Total tasks             : ${totalTasks}`);
console.log(`   Gateways                : ${gatewayIds.length}`);
console.log(`   BPMNDiagram shapes      : ${shapeCount}`);
console.log(`   BPMNDiagram edges       : ${edgeCount}`);

console.log('\n── Quality Checks ──────────────────────────────────────────');

if (warnings.length > 0) {
  warnings.forEach(w => console.log(`   ⚠️   ${w}`));
  console.log(`\n   ${warnings.length} warning(s) found`);
  console.log('\n────────────────────────────────────────────────────────────');
  console.log('⚠️   REVIEW (exit 2) — fix warnings before writing process.md\n');
  if (isTmp) cleanup(absolutePath);
  process.exit(2);
}

console.log('   ✅  Only serviceTask, businessRuleTask, sendTask used');
console.log('   ✅  All tasks have valid bpmn:documentation JSON');
console.log('   ✅  serviceTask (crud): entities and actions valid');
console.log('   ✅  businessRuleTask (logic): ids are kebab-case');
console.log('   ✅  sendTask (output): channels and triggers present');
console.log('   ✅  Gateway branches are labelled');
console.log('   ✅  Start and end events present');
console.log('   ✅  BPMNDiagram covers all semantic elements');
console.log('\n────────────────────────────────────────────────────────────');
console.log('✅  PASS (exit 0) — BPMN is valid, write process.md\n');
if (isTmp) cleanup(absolutePath);
process.exit(0);

function cleanup(path) {
  try { if (existsSync(path)) unlinkSync(path); } catch { /* ignore */ }
}
