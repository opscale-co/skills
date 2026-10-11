// skills/bpmn.mjs — opscale-bpmn JSON contract: schema + semantic rules + render
// orchestration. Mirrors skills/process.mjs. The skill's thin scripts/ wrappers
// call generate() and validate(); heavy deps (ajv, bpmn-moddle) resolve from the
// shared contract's own node_modules because this module lives under it.
//
// bpmn.json is the source of truth; bpmn.bpmn is a deterministic projection
// (render/bpmn.mjs). validate() also re-imports the rendered XML through
// bpmn-moddle (a parse error ⇒ FAIL) and confirms the on-disk file matches.
import fs from 'node:fs';
import path from 'node:path';
import BpmnModdle from 'bpmn-moddle';
import { compileSchema, readJson, Reporter } from '../validate.mjs';
import { render } from '../render/bpmn.mjs';

export const ARTIFACT = 'bpmn.json';
const SCHEMA_REL = 'schema/bpmn.schema.json';
const OUT = 'bpmn.bpmn';

const subOf = (step) => step.slice(0, 5);          // "SP-01-02" → "SP-01"
// verb heuristic: these suffixes almost always mark a noun, not a verb (the first
// token of a logic id should read as a verb). Kept narrow to avoid false positives
// on verbs like "advance"/"balance" (-ance) — only strong, reliable noun endings.
const NOUNY = /(tion|sion|ment|ness|ity)$/;

// Flatten the nested operations map into {op, subKey, stepKey, idx} tuples.
function flattenOps(opsMap, R) {
  const flat = [];
  for (const [subKey, steps] of Object.entries(opsMap || {})) {
    if (typeof steps !== 'object' || steps === null || Array.isArray(steps)) {
      if (R) R.fail(`operations["${subKey}"] must be an object of step → operation-array entries`);
      continue;
    }
    for (const [stepKey, arr] of Object.entries(steps)) {
      if (!Array.isArray(arr)) {
        if (R) R.fail(`operations["${subKey}"]["${stepKey}"] must be an array of operations`);
        continue;
      }
      arr.forEach((op, idx) => flat.push({ op, subKey, stepKey, idx }));
    }
  }
  return flat;
}

// Rules ajv can't express.
function semantic(json, R, planDir) {
  const flat = flattenOps(json.operations, R);
  const firstOps = flat.map((f) => f.op);
  const firstLogicIds = new Set(firstOps.filter((o) => o.type === 'logic').map((o) => o.id));

  // 1. code uniqueness (first-level + child) and child-prefix well-formedness.
  const seen = new Map();
  const note = (code, where) => {
    if (seen.has(code)) R.fail(`code "${code}" is not unique (also at ${seen.get(code)}, again at ${where})`);
    else seen.set(code, where);
  };
  for (const { op } of flat) {
    note(op.code, op.code);
    if (op.type === 'logic') {
      for (const m of op.operations) {
        note(m.code, `${op.code}.operations`);
        if (!m.code.startsWith(`${op.code}-`))
          R.fail(`operation code "${m.code}" is not prefixed by its Logic code "${op.code}"`);
      }
    }
  }

  // 2. map keys are consistent, each op code is prefixed by its step key, and
  //    position restarts at 1 per step and equals the 1-based array index.
  for (const { op, subKey, stepKey, idx } of flat) {
    if (subOf(stepKey) !== subKey)
      R.fail(`step key "${stepKey}" is nested under subprocess "${subKey}" but belongs to "${subOf(stepKey)}"`);
    if (!op.code.startsWith(`${stepKey}-`))
      R.fail(`operation code "${op.code}" is not prefixed by its step key "${stepKey}"`);
    if (op.position !== idx + 1)
      R.fail(`operation "${op.code}": position ${op.position} ≠ its 1-based index ${idx + 1} within step ${stepKey}`);
  }

  // 3. every child logic.ref resolves to a first-level logic id.
  for (const { op } of flat) {
    if (op.type !== 'logic') continue;
    for (const m of op.operations) {
      if (m.type === 'logic' && !firstLogicIds.has(m.ref))
        R.fail(`child logic reference "${m.ref}" (in ${op.code}) resolves to no first-level logic id`);
    }
  }

  // 4. repeatReason: a first-level crud whose entity+action repeats across >1 op
  //    must carry a non-empty repeatReason on EACH occurrence.
  const crudGroups = new Map();
  for (const { op } of flat) if (op.type === 'crud') {
    const k = `${op.entity}:${op.action}`;
    (crudGroups.get(k) || crudGroups.set(k, []).get(k)).push(op);
  }
  for (const [k, group] of crudGroups) {
    if (group.length < 2) continue;
    for (const op of group)
      if (!op.repeatReason || !op.repeatReason.trim())
        R.fail(`crud ${op.code} ("${k}") repeats across ${group.length} operations — each must carry a non-empty repeatReason`);
  }

  // 5. logic.id verb heuristic (first token should read as a verb). rules MAY be
  //    empty ([]) — they are numbered later by opscale-sipoc, so no rule check here.
  for (const { op } of flat) if (op.type === 'logic') {
    const first = op.id.split('-')[0];
    if (NOUNY.test(first)) R.warn(`logic id "${op.id}" — first token "${first}" reads like a noun, not a verb`);
  }

  // 6. every subprocess KEY and step KEY must exist in the sibling process.json;
  //    gateway steps too. The map keys are references INTO process.json.
  const subKeys = new Set(flat.map((f) => f.subKey));
  const stepKeys = new Set(flat.map((f) => f.stepKey));
  for (const g of (json.gateways || [])) stepKeys.add(g.step);
  const procPath = path.join(planDir, 'process.json');
  if (fs.existsSync(procPath)) {
    let proc; try { proc = readJson(procPath); } catch { proc = null; }
    const knownSub = new Set();
    const knownStep = new Set();
    if (proc && Array.isArray(proc.subprocesses))
      for (const sp of proc.subprocesses) {
        knownSub.add(sp.code);
        for (const st of (sp.steps || [])) knownStep.add(st.code);
      }
    if (knownStep.size) {
      for (const sk of subKeys)
        if (!knownSub.has(sk)) R.fail(`subprocess key ${sk} is referenced but not defined in process.json`);
      for (const st of stepKeys)
        if (!knownStep.has(st)) R.fail(`step ${st} is referenced but not defined in process.json`);
    } else R.warn('process.json present but no steps found to cross-check');
  } else {
    R.warn('process.json not found in planDir — subprocess/step existence not cross-checked');
  }

  // downstream handoff: expose the logic id set (sipoc/graph rely on it).
  if (firstLogicIds.size) R.pass(`logic ids: ${[...firstLogicIds].join(', ')}`);
}

function schemaFor(skillDir) {
  return compileSchema(path.join(skillDir, SCHEMA_REL));
}

// Load the sibling process.json (subprocess/step NAMES live there, not in
// bpmn.json). The renderer needs it to name the subProcess containers and to
// derive the embedded process-doc module.
function readProcess(planDir) {
  const p = path.join(planDir, 'process.json');
  if (!fs.existsSync(p)) return { subprocesses: [] };
  try { return readJson(p); } catch { return { subprocesses: [] }; }
}

// Load the sibling dbml.json — the renderer derives the modeling `standard` from
// it (standards.modeling). Absent ⇒ render with standard: "" (caller warns).
function readDbml(planDir, R) {
  const p = path.join(planDir, 'dbml.json');
  if (!fs.existsSync(p)) {
    if (R) R.warn('dbml.json not found in planDir — rendering with an empty modeling standard');
    return {};
  }
  try { return readJson(p); } catch { return {}; }
}

export async function writeRendered(json, processJson, dbmlJson, planDir) {
  const files = await render(json, processJson, dbmlJson);
  for (const [rel, content] of Object.entries(files)) fs.writeFileSync(path.join(planDir, rel), content);
  return Object.keys(files);
}

// generate: validate the authored JSON, then project the BPMN XML.
export async function generate({ planDir, skillDir }) {
  const R = new Reporter('generate-bpmn');
  const jsonPath = path.join(planDir, ARTIFACT);
  if (!fs.existsSync(jsonPath)) { R.fail(`missing ${jsonPath}`); R.finish(); }
  const json = readJson(jsonPath);
  const validate = schemaFor(skillDir);
  if (!R.schema(validate, json, ARTIFACT)) R.finish();
  semantic(json, R, planDir);
  if (R.failures.length) R.finish();
  const written = await writeRendered(json, readProcess(planDir), readDbml(planDir, R), planDir);
  R.pass(`rendered ${written.join(', ')}`);
  R.finish();
}

// validate: schema + semantic, re-render in memory, re-import the rendered XML via
// bpmn-moddle (parse error ⇒ FAIL), confirm it has expandable subProcess elements,
// and confirm the on-disk bpmn.bpmn matches the projection (no manual drift).
export async function validate({ planDir, skillDir }) {
  const R = new Reporter('validate-bpmn');
  const jsonPath = path.join(planDir, ARTIFACT);
  if (!fs.existsSync(jsonPath)) { R.fail(`missing ${jsonPath}`); R.finish(); }
  const json = readJson(jsonPath);
  const check = schemaFor(skillDir);
  if (!R.schema(check, json, ARTIFACT)) R.finish();   // can't render invalid JSON
  semantic(json, R, planDir);
  if (R.failures.length) R.finish();

  const processJson = readProcess(planDir);
  const dbmlJson = readDbml(planDir, R);
  const files = await render(json, processJson, dbmlJson);
  const xml = files[OUT];

  // re-import the projection — a parse error means the XML we emit is invalid BPMN.
  const moddle = new BpmnModdle();
  try {
    const { warnings } = await moddle.fromXML(xml);
    if (warnings && warnings.length) {
      for (const w of warnings) R.warn(`bpmn-moddle import warning: ${w.message || w}`);
    } else R.pass('rendered XML re-imports cleanly via bpmn-moddle');
  } catch (e) {
    R.fail(`rendered XML fails to re-import via bpmn-moddle: ${e.message}`);
    R.finish();
  }
  if (!/<bpmn:subProcess\b/.test(xml)) R.fail('rendered XML has no <bpmn:subProcess> — expandable containers are required');
  else R.pass(`${(xml.match(/<bpmn:subProcess\b/g) || []).length} <bpmn:subProcess> container(s)`);

  const outPath = path.join(planDir, OUT);
  if (fs.existsSync(outPath)) {
    if (fs.readFileSync(outPath, 'utf8') !== xml)
      R.fail(`${OUT} on disk differs from the projection of bpmn.json — re-run render`);
    else R.pass(`${OUT} matches the projection`);
  } else R.warn(`${OUT} not yet rendered`);

  if (!R.failures.length) {
    const flat = flattenOps(json.operations);
    const logics = flat.filter((f) => f.op.type === 'logic').length;
    const cruds = flat.filter((f) => f.op.type === 'crud').length;
    const subCount = Object.keys(json.operations || {}).length;
    R.pass(`${subCount} subprocesses, ${cruds} crud + ${logics} logic operations`);
  }
  R.finish();
}
