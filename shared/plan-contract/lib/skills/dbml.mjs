// skills/dbml.mjs — opscale-dbml JSON contract: schema + semantic rules +
// render orchestration. Mirrors skills/process.mjs. The skill's thin scripts/
// wrappers call generate() and validate(); everything heavy (ajv, rendering,
// @dbml/core) resolves its deps from the shared contract's own node_modules
// because this module lives under it.
import fs from 'node:fs';
import path from 'node:path';
import { compileSchema, readJson, slugify, Reporter } from '../validate.mjs';
import { render } from '../render/dbml.mjs';

export const ARTIFACT = 'dbml.json';
const SCHEMA_REL = 'schema/dbml.schema.json';

// Field roles are inferred from structure (there is no `category` property).
const isPk = (f) => f.code === 'id' && f.type === 'identifier';
const isRef = (f) => f.foreignKey !== undefined || f.externalRef !== undefined;

// Parse a predicate ("true|false|field op value [and|or …]") into the list of
// `{ field, value }` comparisons. `true`/`false` yield none.
function predicateComparisons(pred) {
  const t = String(pred).trim();
  if (t === 'true' || t === 'false') return [];
  return t.split(/\s+(?:and|or)\s+/).map((clause) => {
    const m = clause.trim().match(/^([a-z_][a-z0-9_.]*)\s*(?:=|!=|>=|<=|>|<)\s*(\S+)$/);
    if (!m) return null;
    return { field: m[1], value: m[2].replace(/^['"]|['"]$/g, '') };
  }).filter(Boolean);
}

// Rules ajv can't express.
function semantic(json, R, { planDir } = {}) {
  const entities = json.entities || [];
  const entityCodes = new Set(entities.map((e) => e.code));
  const enumByCode = new Map((json.enums || []).map((en) => [en.code, en]));

  // External-ref slugs declared across the doc → cross-check against external-refs.md.
  const extRefText = (() => {
    if (!planDir) return null;
    const p = path.join(planDir, 'context', 'external-refs.md');
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  })();

  for (const e of entities) {
    // Entity code equals slugify(name).
    const expect = slugify(e.name);
    if (e.code !== expect)
      R.fail(`entity "${e.name}" code should be "${expect}" (found "${e.code}")`);

    const fields = e.fields || [];

    // Exactly one pk — the `id identifier` column.
    const pks = fields.filter(isPk);
    if (pks.length !== 1)
      R.fail(`${e.code}: must have exactly one pk field — an "id" of type identifier (found ${pks.length})`);

    // Field order: pk first, then foreign/external references, then the rest.
    const rankOf = (f) => (isPk(f) ? 0 : isRef(f) ? 1 : 2);
    let lastRank = -1;
    for (const f of fields) {
      const r = rankOf(f);
      if (r < lastRank)
        R.fail(`${e.code}.${f.code}: fields must be ordered pk → foreign/external refs → the rest`);
      lastRank = Math.max(lastRank, r);
    }

    // Calculated fields are derived by the system — never a pk or a reference.
    for (const f of fields) {
      if (f.calculated && (isPk(f) || isRef(f)))
        R.fail(`${e.code}.${f.code}: a calculated field cannot be a pk or a foreign/external reference`);
    }

    // No tenant_id anywhere (single-tenant).
    if (fields.some((f) => f.code === 'tenant_id'))
      R.fail(`${e.code}: has a 'tenant_id' column — Opscale is single-tenant by design. Remove it.`);

    const fieldByCode = new Map(fields.map((f) => [f.code, f]));

    for (const f of fields) {
      // foreignKey targets resolve to an entity in this doc.
      if (f.foreignKey !== undefined && !entityCodes.has(f.foreignKey))
        R.fail(`${e.code}.${f.code}: foreignKey "${f.foreignKey}" is not an entity in this doc`);
      // enum refs resolve to an enum code.
      if (f.enum !== undefined && !enumByCode.has(f.enum))
        R.fail(`${e.code}.${f.code}: enum "${f.enum}" is not a declared enum`);
      // externalRef slugs should appear in external-refs.md (warn if not).
      if (f.externalRef !== undefined && extRefText !== null && !extRefText.includes(f.externalRef))
        R.warn(`${e.code}.${f.code}: external ref "${f.externalRef}" not found in context/external-refs.md`);
    }

    // Permission predicates: referenced fields exist; enum-value comparisons resolve.
    for (const kind of ['create', 'update', 'delete']) {
      const pred = e.permissions?.[kind];
      if (!pred) continue;
      for (const cmp of predicateComparisons(pred)) {
        const base = cmp.field.split('.')[0];
        const f = fieldByCode.get(base);
        if (!f) {
          R.fail(`${e.code}.permissions.${kind}: predicate references unknown field "${base}"`);
          continue;
        }
        if (f.enum !== undefined && /[a-zA-Z]/.test(cmp.value)) {
          const en = enumByCode.get(f.enum);
          if (en && !en.values.some((v) => v.value === cmp.value))
            R.fail(`${e.code}.permissions.${kind}: "${cmp.value}" is not a value of enum "${f.enum}" (field ${base})`);
        }
      }
    }
  }
}

function schemaFor(skillDir) {
  return compileSchema(path.join(skillDir, SCHEMA_REL));
}

// dbml.json no longer carries `module` — it is read from the sibling
// process.json (the single source). dbml's prerequisite IS process, so a
// missing process.json is a hard failure.
function readProcess(planDir) {
  const p = path.join(planDir, 'process.json');
  if (!fs.existsSync(p))
    throw new Error(`missing sibling process.json in ${planDir} — opscale-dbml derives its module (subdomain) from process.json; run /opscale-process first`);
  return readJson(p);
}

export function writeRendered(json, planDir) {
  const proc = readProcess(planDir);
  const files = render(json, proc);
  for (const [rel, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(planDir, rel), content);
  }
  return Object.keys(files);
}

// generate: validate the authored JSON, then project the DBML.
export function generate({ planDir, skillDir }) {
  const R = new Reporter('generate-dbml');
  const jsonPath = path.join(planDir, ARTIFACT);
  if (!fs.existsSync(jsonPath)) { R.fail(`missing ${jsonPath}`); R.finish(); }
  const json = readJson(jsonPath);
  const validate = schemaFor(skillDir);
  if (!R.schema(validate, json, ARTIFACT)) R.finish();
  semantic(json, R, { planDir });
  if (R.failures.length) R.finish();
  const written = writeRendered(json, planDir);
  R.pass(`rendered ${written.join(', ')}`);
  R.finish();
}

// validate: schema + semantic, then re-render in memory, parse the DBML with
// @dbml/core (a parse throw is a FAIL), and confirm the on-disk dbml.dbml
// matches the projection (no manual drift).
export async function validate({ planDir, skillDir }) {
  const R = new Reporter('validate-dbml');
  const jsonPath = path.join(planDir, ARTIFACT);
  if (!fs.existsSync(jsonPath)) { R.fail(`missing ${jsonPath}`); R.finish(); }
  const json = readJson(jsonPath);
  const check = schemaFor(skillDir);
  R.schema(check, json, ARTIFACT);
  semantic(json, R, { planDir });

  const proc = readProcess(planDir);
  const files = render(json, proc);
  const dbml = files['dbml.dbml'];

  // Parse the rendered DBML with @dbml/core — a throw is a hard FAIL.
  try {
    const { Parser } = await import('@dbml/core');
    const db = Parser.parse(dbml, 'dbml');
    const tables = db.schemas.flatMap((s) => s.tables);
    const enums = db.schemas.flatMap((s) => s.enums);
    R.pass(`@dbml/core parsed ${tables.length} tables, ${enums.length} enums`);
  } catch (err) {
    const where = err.location ? ` at line ${err.location.start.line}` : '';
    R.fail(`@dbml/core could not parse the rendered dbml.dbml${where}: ${err.message || err}`);
  }

  const dbmlPath = path.join(planDir, 'dbml.dbml');
  if (fs.existsSync(dbmlPath)) {
    if (fs.readFileSync(dbmlPath, 'utf8') !== dbml)
      R.fail('dbml.dbml on disk differs from the projection of dbml.json — re-run render');
    else R.pass('dbml.dbml matches the projection');
  } else R.warn('dbml.dbml not yet rendered');

  if (!R.failures.length) {
    const enums = (json.enums || []).length;
    R.pass(`${json.entities.length} entities, ${enums} enums`);
  }
  R.finish();
}
