// skills/sipoc.mjs — opscale-sipoc JSON contract: schema + semantic rules +
// render orchestration. Mirrors skills/dbml.mjs. The skill's thin scripts/
// wrappers call generate() and validate(); everything heavy (ajv, rendering)
// resolves its deps from the shared contract's own node_modules because this
// module lives under it. sipoc renders MULTIPLE files (one per logic op).
import fs from 'node:fs';
import path from 'node:path';
import { compileSchema, readJson, sequential, Reporter, COMMON_SCHEMA_PATH } from '../validate.mjs';
import { render } from '../render/sipoc.mjs';

export const ARTIFACT = 'sipoc.json';
const SCHEMA_REL = 'schema/sipoc.schema.json';

// The sibling bpmn.json first-level `type:"logic"` ops — the authoritative set
// of SIPOCs. bpmn.json's `operations` is a nested map (subprocess → step →
// op array); flatten every step array to collect the first-level logic ops.
// Each op carries its composed `operations[]` so the SIPOC process[] can be
// checked against the codes the logic actually composes.
// Returns { ops: [{id, code, operations}], present: bool } or present:false.
function bpmnLogicOps(planDir) {
  const p = path.join(planDir, 'bpmn.json');
  if (!fs.existsSync(p)) return { ops: [], present: false };
  const bpmn = readJson(p);
  const ops = [];
  for (const steps of Object.values(bpmn.operations || {}))
    for (const arr of Object.values(steps))
      for (const o of arr)
        if (o.type === 'logic') ops.push({ id: o.id, code: o.code, operations: o.operations || [] });
  return { ops, present: true };
}

// The businessType enum + entity codes an output `type` may resolve to.
function businessTypeSet() {
  const common = readJson(COMMON_SCHEMA_PATH);
  return new Set(common.$defs.businessType.enum);
}
function sipocInputTypeSet() {
  const common = readJson(COMMON_SCHEMA_PATH);
  return new Set(common.$defs.sipocInputType.enum);
}

// Rules ajv can't express.
function semantic(json, R, { planDir } = {}) {
  const sipocs = json.sipocs || [];
  const sipocIds = new Set(sipocs.map((s) => s.id));

  // 1:1 with the BPMN first-level logic ops — the link is purely by id.
  const { ops, present } = bpmnLogicOps(planDir);
  if (!present) {
    R.warn('bpmn.json absent — skipped the 1:1 SIPOC ↔ logic-op cross-check and the process-op composition check');
  } else {
    const opById = new Map(ops.map((o) => [o.id, o]));
    const logicIds = new Set(ops.map((o) => o.id));
    for (const s of sipocs)
      if (!logicIds.has(s.id))
        R.fail(`sipoc "${s.id}" is not a BPMN first-level logic op (no such logic id in bpmn.json)`);
    for (const o of ops)
      if (!sipocIds.has(o.id))
        R.fail(`BPMN logic op "${o.id}" (${o.code}) has no SIPOC — exactly one SIPOC per logic op is required`);
    if (!R.failures.length) R.pass(`1:1 SIPOC ↔ BPMN logic ops (${ops.length})`);

    // Each process[].operation is a composed op code of the matching logic op;
    // warn when the logic composes an operation no process step covers.
    for (const s of sipocs) {
      const op = opById.get(s.id);
      if (!op) continue; // not a logic op — already failed above
      const composed = new Set((op.operations || []).map((c) => c.code));
      const covered = new Set();
      for (const p of s.process) {
        if (!composed.has(p.operation))
          R.fail(`sipoc "${s.id}": process operation "${p.operation}" is not a composed operation of the matching BPMN logic "${s.id}" (${op.code}) — expected one of {${[...composed].join(', ') || 'none'}}`);
        else covered.add(p.operation);
      }
      for (const c of composed)
        if (!covered.has(c))
          R.warn(`sipoc "${s.id}": BPMN logic "${s.id}" (${op.code}) composes "${c}" but no process step covers it`);
    }
  }

  // composes resolve to another sipoc id or a bpmn logic id.
  const logicIds = new Set(ops.map((o) => o.id));
  for (const s of sipocs)
    for (const c of s.composes)
      if (!sipocIds.has(c) && !logicIds.has(c))
        R.fail(`sipoc "${s.id}": composes "${c}" is neither a SIPOC id nor a BPMN logic id`);

  // Input types ∈ sipocInputType (schema enforces; friendly message here too).
  const inputTypes = sipocInputTypeSet();
  for (const s of sipocs)
    for (const i of s.inputs)
      if (!inputTypes.has(i.type))
        R.fail(`sipoc "${s.id}": input "${i.name}" type "${i.type}" is not a SIPOC business type — inputs are business types and NEVER ambiguous ones (snippet, metadata, …)`);

  // Output types resolve to a businessType, the literal 'bool', or a dbml entity code.
  const bTypes = businessTypeSet();
  const dbmlPath = planDir ? path.join(planDir, 'dbml.json') : null;
  let entityCodes = null;
  if (dbmlPath && fs.existsSync(dbmlPath)) {
    entityCodes = new Set((readJson(dbmlPath).entities || []).map((e) => e.code));
  } else {
    R.warn('dbml.json absent — output types resolving to entity codes cannot be cross-checked');
  }
  for (const s of sipocs)
    for (const o of s.outputs) {
      const ok = o.type === 'bool' || bTypes.has(o.type) || (entityCodes ? entityCodes.has(o.type) : false);
      if (!ok) {
        if (entityCodes) R.fail(`sipoc "${s.id}": output "${o.name}" type "${o.type}" is not a businessType, 'bool', or an entity code in dbml.json`);
        else if (!(o.type === 'bool' || bTypes.has(o.type))) R.warn(`sipoc "${s.id}": output "${o.name}" type "${o.type}" is not a businessType or 'bool' — assuming an entity code (dbml.json absent)`);
      }
    }

  // Each process[].rule must be one of this SIPOC's businessRules[].code.
  for (const s of sipocs) {
    const known = new Set(s.businessRules.map((b) => b.code));
    for (const p of s.process)
      if (p.rule && !known.has(p.rule))
        R.fail(`sipoc "${s.id}": process operation "${p.operation}" cites rule "${p.rule}", which is not in this SIPOC's businessRules`);
  }

  // BR codes module-unique and continuous (BR-01, BR-02, …) across all SIPOCs.
  const defs = [];
  for (const s of sipocs) for (const b of s.businessRules) defs.push(b.code);
  const seen = new Set();
  for (const code of defs) {
    if (seen.has(code)) R.fail(`BR "${code}" is defined more than once — each BR is defined in exactly one SIPOC`);
    seen.add(code);
  }
  const ordered = [...seen].sort();
  for (const e of sequential(ordered, (n) => `BR-${String(n).padStart(2, '0')}`))
    R.fail(`business rule ${e}`);
}

function schemaFor(skillDir) {
  return compileSchema(path.join(skillDir, SCHEMA_REL));
}

export function writeRendered(json, planDir) {
  const files = render(json);
  fs.mkdirSync(path.join(planDir, 'sipoc'), { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(planDir, rel), content);
  }
  return Object.keys(files);
}

// generate: validate the authored JSON, then project the SIPOC markdown files.
export function generate({ planDir, skillDir }) {
  const R = new Reporter('generate-sipoc');
  const jsonPath = path.join(planDir, ARTIFACT);
  if (!fs.existsSync(jsonPath)) { R.fail(`missing ${jsonPath}`); R.finish(); }
  const json = readJson(jsonPath);
  const validate = schemaFor(skillDir);
  if (!R.schema(validate, json, ARTIFACT)) R.finish();
  semantic(json, R, { planDir });
  if (R.failures.length) R.finish();
  const written = writeRendered(json, planDir);
  R.pass(`rendered ${written.length} files: ${written.join(', ')}`);
  R.finish();
}

// validate: schema + semantic, then re-render in memory and confirm each on-disk
// sipoc/<id>.md matches the projection (no manual drift).
export async function validate({ planDir, skillDir }) {
  const R = new Reporter('validate-sipoc');
  const jsonPath = path.join(planDir, ARTIFACT);
  if (!fs.existsSync(jsonPath)) { R.fail(`missing ${jsonPath}`); R.finish(); }
  const json = readJson(jsonPath);
  const check = schemaFor(skillDir);
  R.schema(check, json, ARTIFACT);
  semantic(json, R, { planDir });

  // Only project + compare once the JSON is structurally sound — rendering a
  // schema-invalid doc would throw on the missing fields instead of reporting.
  if (!R.failures.length) {
    const files = render(json);
    let matched = 0;
    let missing = 0;
    for (const [rel, content] of Object.entries(files)) {
      const p = path.join(planDir, rel);
      if (!fs.existsSync(p)) { R.warn(`${rel} not yet rendered`); missing++; continue; }
      if (fs.readFileSync(p, 'utf8') !== content)
        R.fail(`${rel} on disk differs from the projection of sipoc.json — re-run render`);
      else matched++;
    }
    if (matched && !missing && !R.failures.length) R.pass(`${matched} SIPOC file(s) match the projection`);
  }

  if (!R.failures.length) {
    const brs = new Set();
    for (const s of json.sipocs) for (const b of s.businessRules) brs.add(b.code);
    R.pass(`${json.sipocs.length} SIPOCs, ${brs.size} business rules`);
  }
  R.finish();
}
