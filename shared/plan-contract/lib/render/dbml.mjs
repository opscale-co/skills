// render/dbml.mjs — deterministic projection of dbml.json → dbml.dbml.
//
// Raw DBML (parseable by @dbml/core): a banner-commented PROJECT / ENUMS /
// TABLES layout. The Project Note carries the subdomain header, source spec,
// modeling standard, the narrative and a Bounded Context block; every Enum
// renders one value per line with its description as the note; every entity
// becomes a snake_singular Table with its fields ordered pk → refs → rest, the two
// audit timestamps appended, an indexes block from FKs/externals/status
// columns, and a table Note opening with the entity's kebab id.
//
// Permissions have NO DBML construct — they live in dbml.json only (consumed
// downstream) and are deliberately not rendered here.

// DBML triple-quoted notes can't contain a triple quote; single '-notes can't
// contain a single quote — fold them to a safe char and collapse whitespace.
const sq = (s) => String(s).replace(/'/g, '’').replace(/\s+/g, ' ').trim();
const block = (s) => String(s).replace(/'''/g, "''").replace(/[ \t]+$/gm, '').trim();

const tableName = (code) => String(code).replace(/-/g, '_');
const titleCase = (s) => s.replace(/(^|[\s_-])(\w)/g, (_, p, c) => p.replace(/[_-]/, ' ') + c.toUpperCase()).trim();

const BANNER = (title) =>
  `//=====================================\n// ${title}\n//=====================================`;

// Field roles are inferred from structure (there is no `category` property):
// the pk is the `id identifier` column; a reference is a foreignKey/externalRef.
const isPk = (f) => f.code === 'id' && f.type === 'identifier';
const isRef = (f) => f.foreignKey !== undefined || f.externalRef !== undefined;

// Resolve the DBML column type for a field.
function dbmlType(f) {
  if (f.foreignKey !== undefined || f.externalRef !== undefined) return 'identifier';
  if (f.enum !== undefined) return f.enum;
  return f.type; // business-type slug
}

// A FK field renders a 1:1 ref ("-") when the target entity declares a
// has_one relationship back to the owning entity; otherwise N:1 (">").
function fkArrow(ownerCode, targetCode, byCode) {
  const target = byCode.get(targetCode);
  if (target && (target.relationships || []).some((r) => r.type === 'has_one' && r.target === ownerCode))
    return '-';
  return '>';
}

function fmtDefault(v) {
  return typeof v === 'string' ? `'${sq(v)}'` : `${v}`;
}

// ── Project block ─────────────────────────────────────────────────────────────
// The subdomain/module is NOT carried by dbml.json — it comes from the sibling
// process.json (the single source of `module`), threaded in by lib/skills/dbml.mjs.
function renderProject(json, module) {
  const sub = module.subdomain;
  const leaf = sub.split('/').filter(Boolean).pop() || sub;
  const projectName = titleCase(leaf);

  const tables = json.entities.map((e) => tableName(e.code));
  const extSlugs = [];
  for (const e of json.entities)
    for (const f of e.fields)
      if (f.externalRef !== undefined && !extSlugs.includes(f.externalRef)) extSlugs.push(f.externalRef);

  const note = [];
  note.push(`# Subdomain: ${projectName}`);
  note.push(`Source spec: ${sub}/process.txt`);
  note.push(`Modeling standard: ${block(json.standards.modeling)}`);
  if (json.standards.process) note.push(`Reference behavior: ${block(json.standards.process)}`);
  if (json.standards.notes) note.push('', block(json.standards.notes));
  note.push('', '## Bounded Context');
  note.push(`- Core entities: ${tables.join(', ')}`);
  if (extSlugs.length) note.push(`- Depends on (external refs): ${extSlugs.join(', ')}`);

  const indented = note.join('\n').split('\n').map((l) => (l ? `  ${l}` : '')).join('\n');

  return [
    BANNER('PROJECT'),
    '',
    `Project ${projectName} {`,
    `  database_type: 'MySQL'`,
    '',
    `  Note: '''`,
    indented,
    `  '''`,
    '}',
  ].join('\n');
}

// ── Enums ──────────────────────────────────────────────────────────────────────
function renderEnums(json) {
  const enums = json.enums || [];
  if (!enums.length) return '';
  const blocks = enums.map((en) => {
    const w = Math.max(...en.values.map((v) => v.value.length));
    const lines = en.values.map((v) => `  ${v.value.padEnd(w)} [note: '${sq(v.description)}']`);
    return [`Enum ${en.code} {`, ...lines, '}'].join('\n');
  });
  return [BANNER('ENUMS'), '', blocks.join('\n\n')].join('\n');
}

// ── Tables ───────────────────────────────────────────────────────────────────
// No `category` property: render the pk first, then references, then the rest —
// each bucket keeps the authored order.
function orderedFields(entity) {
  const fs = entity.fields;
  return [
    ...fs.filter(isPk),
    ...fs.filter((f) => !isPk(f) && isRef(f)),
    ...fs.filter((f) => !isPk(f) && !isRef(f)),
  ];
}

function fieldModifiers(entity, f, byCode) {
  const parts = [];
  if (isPk(f)) {
    parts.push('pk');
    parts.push(`note: 'ULID generado en la aplicación'`);
    return parts;
  }

  if (f.foreignKey !== undefined) {
    const tgt = tableName(f.foreignKey);
    const arrow = fkArrow(entity.code, f.foreignKey, byCode);
    parts.push(`ref: ${arrow} ${tgt}.id`);
  }

  const nullable = f.nullable === true;
  parts.push(nullable ? 'null' : 'not null');

  // Default: explicit wins; a non-nullable enum column with none falls back to
  // its first enum value (matches the real ventas status columns).
  let def = f.default;
  if ((def === undefined || def === null) && f.enum !== undefined && !nullable) {
    const en = (byCode.enums || new Map()).get(f.enum);
    if (en) def = en.values[0].value;
  }
  if (def !== undefined && def !== null) parts.push(`default: ${fmtDefault(def)}`);

  if (f.externalRef !== undefined) {
    parts.push(`note: '// external_ref:${f.externalRef} | ${sq(f.description)}'`);
  } else {
    // A calculated field is derived by the system, never captured as input.
    const desc = f.calculated ? `${f.description} (calculado: derivado, no capturado)` : f.description;
    parts.push(`note: '${sq(desc)}'`);
  }
  return parts;
}

function renderIndexes(entity) {
  const idx = [];
  for (const f of entity.fields) {
    if (f.foreignKey !== undefined || f.externalRef !== undefined || f.enum !== undefined)
      idx.push(f.code);
  }
  if (!idx.length) return null;
  const table = tableName(entity.code);
  const w = Math.max(...idx.map((c) => c.length));
  const lines = idx.map((c) => `    ${c.padEnd(w)} [name: 'idx_${table}_${c}']`);
  return ['  indexes {', ...lines, '  }'].join('\n');
}

function renderTable(entity, byCode) {
  const table = tableName(entity.code);
  const fields = orderedFields(entity).concat([
    { code: 'created_at', type: 'timestamp', __audit: true, nullable: false },
    { code: 'updated_at', type: 'timestamp', __audit: true, nullable: false },
  ]);

  const rows = fields.map((f) => {
    const t = f.__audit ? 'timestamp' : dbmlType(f);
    const mods = f.__audit ? ['not null'] : fieldModifiers(entity, f, byCode);
    return { code: f.code, type: t, mods: `[${mods.join(', ')}]` };
  });

  const nameW = Math.max(...rows.map((r) => r.code.length));
  const typeW = Math.max(...rows.map((r) => r.type.length));
  const body = rows.map((r) => `  ${r.code.padEnd(nameW)}  ${r.type.padEnd(typeW)} ${r.mods}`);

  const out = [`Table ${table} {`, ...body];
  const idx = renderIndexes(entity);
  if (idx) out.push('', idx);
  out.push('', `  Note: '''`, `  ${entity.code} — ${sq(entity.description)}`, `  '''`, '}');
  return out.join('\n');
}

function renderTables(json) {
  const byCode = new Map(json.entities.map((e) => [e.code, e]));
  byCode.enums = new Map((json.enums || []).map((en) => [en.code, en]));
  const blocks = json.entities.map((e) => renderTable(e, byCode));
  return [BANNER('TABLES'), '', blocks.join('\n\n')].join('\n');
}

export function renderDbml(json, module) {
  const sections = [renderProject(json, module), renderEnums(json), renderTables(json)].filter(Boolean);
  return sections.join('\n\n') + '\n';
}

// render(dbmlJson, processJson) — `module` (software/domain/subdomain) is sourced
// from processJson, the single source of truth; dbml.json no longer carries it.
export function render(dbmlJson, processJson) {
  return { 'dbml.dbml': renderDbml(dbmlJson, processJson.module) };
}
