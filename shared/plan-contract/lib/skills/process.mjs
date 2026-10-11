// skills/process.mjs — opscale-process JSON contract: schema + semantic rules +
// render orchestration. The skill's thin scripts/ wrappers call generate() and
// validate(); everything heavy (ajv, rendering) resolves its deps from the
// shared contract's own node_modules because this module lives under it.
import fs from 'node:fs';
import path from 'node:path';
import { compileSchema, readJson, lintMermaidFlowchart, sequential, Reporter } from '../validate.mjs';
import { render } from '../render/process.mjs';

export const ARTIFACT = 'process.json';
const SCHEMA_REL = 'schema/process.schema.json';

// Rules ajv can't express: code sequences and the wait-boundary rule.
function semantic(json, R) {
  const subs = json.subprocesses || [];
  for (const e of sequential(subs.map((s) => s.code), (n) => `SP-${String(n).padStart(2, '0')}`))
    R.fail(`subprocess ${e}`);

  subs.forEach((sp, i) => {
    const xx = sp.code.slice(-2);
    for (const e of sequential((sp.steps || []).map((s) => s.code), (n) => `SP-${xx}-${String(n).padStart(2, '0')}`))
      R.fail(`step ${e} (in ${sp.code})`);

    const isLast = i === subs.length - 1;
    const ends = (sp.endsWith || '').trim();
    if (!isLast && (ends === '' || ends === '—'))
      R.fail(`${sp.code} is not the last subprocess but names no wait event (endsWith "—")`);
    if (isLast && ends !== '—')
      R.warn(`final subprocess ${sp.code} usually closes with endsWith "—" (found "${ends.slice(0, 30)}")`);
  });
}

function schemaFor(skillDir) {
  return compileSchema(path.join(skillDir, SCHEMA_REL));
}

export function writeRendered(json, planDir) {
  const files = render(json);
  for (const [rel, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(planDir, rel), content);
  }
  return Object.keys(files);
}

// generate: validate the authored JSON, then project the diagram(s).
export function generate({ planDir, skillDir }) {
  const R = new Reporter('generate-process');
  const jsonPath = path.join(planDir, ARTIFACT);
  if (!fs.existsSync(jsonPath)) { R.fail(`missing ${jsonPath}`); R.finish(); }
  const json = readJson(jsonPath);
  const validate = schemaFor(skillDir);
  if (!R.schema(validate, json, ARTIFACT)) R.finish();
  semantic(json, R);
  if (R.failures.length) R.finish();
  const written = writeRendered(json, planDir);
  R.pass(`rendered ${written.join(', ')}`);
  R.finish();
}

// validate: schema + semantic, then re-render in memory and lint the diagram,
// and confirm the on-disk process.mmd matches the projection (no manual drift).
export function validate({ planDir, skillDir }) {
  const R = new Reporter('validate-process');
  const jsonPath = path.join(planDir, ARTIFACT);
  if (!fs.existsSync(jsonPath)) { R.fail(`missing ${jsonPath}`); R.finish(); }
  const json = readJson(jsonPath);
  const check = schemaFor(skillDir);
  R.schema(check, json, ARTIFACT);
  semantic(json, R);

  const files = render(json);
  const mmd = files['process.mmd'];
  for (const e of lintMermaidFlowchart(mmd)) R.fail(`mermaid: ${e}`);
  const mmdPath = path.join(planDir, 'process.mmd');
  if (fs.existsSync(mmdPath)) {
    if (fs.readFileSync(mmdPath, 'utf8') !== mmd)
      R.fail('process.mmd on disk differs from the projection of process.json — re-run render');
    else R.pass('process.mmd matches the projection');
  } else R.warn('process.mmd not yet rendered');

  // names.md is the terminology handoff to opscale-dbml (folded into dbml.json
  // terminology there) — soft-checked here, not part of process.json.
  const namesPath = path.join(planDir, 'context', 'names.md');
  if (fs.existsSync(namesPath)) {
    const rows = fs.readFileSync(namesPath, 'utf8').split('\n')
      .filter((l) => /^\s*\|/.test(l) && !/^\s*\|[\s|:-]+\|\s*$/.test(l));
    if (rows.length < 3) R.warn(`context/names.md normalization table has fewer than 2 data rows`);
    else R.pass(`context/names.md: ${rows.length - 1} terminology rows`);
  } else R.warn('context/names.md missing — the terminology handoff to opscale-dbml');

  if (!R.failures.length) {
    const steps = json.subprocesses.reduce((n, s) => n + s.steps.length, 0);
    R.pass(`${json.subprocesses.length} subprocesses, ${steps} steps`);
  }
  R.finish();
}
