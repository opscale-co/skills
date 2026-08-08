#!/usr/bin/env node
/**
 * opscale-dbml — Internal DBML Validator
 *
 * INTERNAL SKILL TOOL — do not copy to projects.
 * Runs from the skill bundle directory during skill execution.
 * Temp files are auto-deleted after validation.
 *
 * Validates a DBML source using @dbml/core. Accepts either a raw .dbml file
 * (canonical form for docs/plan/dbml.dbml) or a .md file containing a fenced
 * ```dbml ... ``` block (used by older drafts). Reports syntax errors with line
 * numbers and quality warnings.
 *
 * Usage:
 *   node {SKILL_DIR}/scripts/validate-dbml.mjs <path-to-file> [subdomain-stem]
 *
 * Examples:
 *   # Validate a workspace temp draft before writing the final file
 *   node {SKILL_DIR}/scripts/validate-dbml.mjs docs/plan/.dbml-validate.tmp.dbml loans
 *
 *   # Validate the final output
 *   node {SKILL_DIR}/scripts/validate-dbml.mjs docs/plan/dbml.dbml loans
 *
 * Exit codes:
 *   0 — PASS: no syntax errors, no quality warnings
 *   1 — FAIL: syntax error (do not write output file)
 *   2 — REVIEW: syntax valid but quality warnings found (fix before writing)
 *
 * Requirements:
 *   @dbml/core — bundled in the skill's own node_modules; no install step.
 */

import { readFileSync, unlinkSync, existsSync } from 'fs';
import { resolve, sep, dirname, join } from 'path';
import { fileURLToPath } from 'url';

// ── 1. Read the file ────────────────────────────────────────────────────────

const filePath = process.argv[2];
// Optional 2nd arg: explicit subdomain stem override (e.g. for temp files
// where the path doesn't carry the spec folder name).
const stemOverride = process.argv[3];

if (!filePath) {
  console.error('❌  Usage: node validate-dbml.mjs <path-to-file> [subdomain-stem]');
  process.exit(1);
}

const absolutePath = resolve(filePath);
const isTmp = filePath.includes('.tmp.');

let raw;
try {
  raw = readFileSync(absolutePath, 'utf-8');
} catch (err) {
  console.error(`❌  Cannot read file: ${filePath}`);
  console.error(`    ${err.message}`);
  process.exit(1);
}

// ── 2. Extract the DBML source ──────────────────────────────────────────────

// .dbml files are raw DBML; .md files carry a fenced ```dbml ... ``` block.
const isRawDbml = filePath.endsWith('.dbml');

let dbml;
if (isRawDbml) {
  dbml = raw;
} else {
  const match = raw.match(/```dbml\n([\s\S]*?)```/);
  if (!match) {
    console.error('❌  No ```dbml ... ``` code block found in the markdown file.');
    console.error('    Make sure the file contains a fenced DBML block, or pass a .dbml file.');
    if (isTmp) cleanupTmp(absolutePath);
    process.exit(1);
  }
  dbml = match[1];
}

const lineCount = dbml.split('\n').length;

console.log(`\n📄  File  : ${filePath}${isTmp ? ' (draft)' : ''}`);
console.log(`📏  Lines : ${lineCount}\n`);

// ── 3. Import @dbml/core ────────────────────────────────────────────────────

let Parser;
try {
  ({ Parser } = await import('@dbml/core'));
} catch {
  console.error('❌  @dbml/core is not available.');
  console.error('    It ships in the skill bundle\'s node_modules — run the script from the skill directory, or reinstall the skill bundle.');
  if (isTmp) cleanupTmp(absolutePath);
  process.exit(1);
}

// ── 4. Parse and validate syntax ────────────────────────────────────────────

let database;
try {
  database = Parser.parse(dbml, 'dbml');
} catch (err) {
  console.error('❌  DBML syntax error — file will NOT be written\n');

  if (err.location) {
    const { line, column } = err.location.start;
    const lines = dbml.split('\n');
    const errorLine = lines[line - 1] || '';
    const pointer = ' '.repeat(Math.max(0, column - 1)) + '^';

    console.error(`    Line ${line}, Column ${column}:`);
    console.error(`    ${errorLine}`);
    console.error(`    ${pointer}`);
    console.error(`\n    ${err.message}`);
  } else {
    console.error(`    ${err.message}`);
  }

  console.log('\n────────────────────────────────────────────────────────────');
  console.log('❌  FAIL (exit 1) — fix syntax errors and re-run\n');
  if (isTmp) cleanupTmp(absolutePath);
  process.exit(1);
}

// ── 5. Model summary ────────────────────────────────────────────────────────

const tables = database.schemas.flatMap(s => s.tables);
const enums  = database.schemas.flatMap(s => s.enums);
const refs   = database.schemas.flatMap(s => s.refs);

console.log('✅  Syntax valid\n');
console.log('── Model Summary ───────────────────────────────────────────');
console.log(`   Tables : ${tables.length}`);
tables.forEach(t => {
  const cols = t.fields.length;
  const idxs = t.indexes.length;
  console.log(`     · ${t.name.padEnd(35)} ${cols} columns, ${idxs} indexes`);
});

console.log(`\n   Enums  : ${enums.length}`);
enums.forEach(e => {
  console.log(`     · ${e.name.padEnd(35)} ${e.values.length} values`);
});

console.log(`\n   Refs   : ${refs.length}`);
refs.forEach(r => {
  const from = `${r.endpoints[0].tableName}.${r.endpoints[0].fieldNames[0]}`;
  const to   = `${r.endpoints[1].tableName}.${r.endpoints[1].fieldNames[0]}`;
  console.log(`     · ${from} → ${to}`);
});

// ── 6. Quality checks ───────────────────────────────────────────────────────

const warnings = [];
const techPatterns = ['is_visible','ui_','display_','cache_','config_','sync_','api_','session_','log_','setting_'];

// Entity-id stamps: every table Note opens with the entity's kebab-case id,
// which is exactly the table name with dashes (invoice_item → invoice-item).
// Assigned here on the FINAL entities — names.md is input only and carries
// no ids.

tables.forEach(t => {
  const fieldNames = t.fields.map(f => f.name);

  if (!fieldNames.includes('id'))
    warnings.push(`[${t.name}] Missing 'id' column (ULID required)`);

  if (!fieldNames.includes('created_at'))
    warnings.push(`[${t.name}] Missing 'created_at' column`);

  if (!fieldNames.includes('updated_at'))
    warnings.push(`[${t.name}] Missing 'updated_at' column`);

  if (!t.note)
    warnings.push(`[${t.name}] Missing table Note block`);

  const noteText = (typeof t.note === 'string' ? t.note : '').trim();
  const idMatch = noteText.match(/^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\s+—\s+\S/);
  const expectedId = t.name.toLowerCase().replace(/_/g, '-');
  if (t.note && !idMatch) {
    warnings.push(`[${t.name}] Table Note must open with its entity id: '${expectedId} — {business meaning}' (kebab-case of the table name)`);
  } else if (idMatch && idMatch[1] !== expectedId) {
    warnings.push(`[${t.name}] Table Note opens with id '${idMatch[1]}' — the entity id is the table name in kebab-case ('${expectedId}')`);
  }

  // Boilerplate columns (ULID PK, timestamps, active flag, sort order) carry
  // standardized semantics across every Opscale table and do NOT need an
  // inline note. Flagging them produced ~80% noise in real modules.
  const boilerplate = new Set([
    'id', 'created_at', 'updated_at', 'deleted_at',
    'is_active', 'sort_order',
  ]);

  // Opscale is single-tenant by design — domain tables MUST NOT carry a
  // `tenant_id` column. Flag it as a quality warning so the user catches the
  // anti-pattern at validation time.
  if (t.fields.some(f => f.name === 'tenant_id')) {
    warnings.push(`[${t.name}] has a 'tenant_id' column — Opscale is single-tenant by design (one database per implementation). Remove it.`);
  }

  t.fields.forEach(f => {
    if (!f.note && !boilerplate.has(f.name))
      warnings.push(`[${t.name}.${f.name}] Missing inline note`);

    if (techPatterns.some(p => f.name.startsWith(p)))
      warnings.push(`[${t.name}.${f.name}] ⚠️  Possible technical/UI column — review DDD compliance`);
  });
});

enums.forEach(e => {
  e.values.forEach(v => {
    if (!v.note)
      warnings.push(`[Enum ${e.name}.${v.name}] Missing note`);
  });
});

// ── 6b. Business-type coverage (Domain Rule 9) ──────────────────────────────
//
// The business type IS the column type: every column's declared type must be
// an Enum of this module or a business-type slug from the registry, written
// directly (`contact_email email`). Technical storage types (varchar, text,
// int, decimal, json, …) are rejected — storage is resolved by the Generate
// binding. `id`/FK/external-ref columns are typed `identifier`. Structural
// timestamps (created_at/updated_at/deleted_at) are `timestamp`. Slugs are
// read from the project registry (docs/plan/context/business-types.md) with
// fallback to the bundle copy.

function loadRegistrySlugs() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve('docs/plan/context/business-types.md'),
    join(scriptDir, '..', 'references', 'business-types.md'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    let text = readFileSync(p, 'utf-8');
    // Relationship slugs (belongs_to, …) are UI intents, not column types.
    text = text.split(/^###\s+Relationships/m)[0];
    const slugs = new Set();
    for (const m of text.matchAll(/^\|\s*`([A-Za-z][A-Za-z0-9]*)`\s*\|/gm)) slugs.add(m[1]);
    if (slugs.size > 0) return { slugs, path: p };
  }
  return null;
}

const STRUCTURAL_TIMESTAMPS = new Set(['created_at', 'updated_at', 'deleted_at']);
const registry = loadRegistrySlugs();

if (!registry) {
  warnings.push(`Business-types registry not found (docs/plan/context/business-types.md or bundle copy) — type coverage NOT checked`);
} else {
  const enumNames = new Set(enums.map(e => e.name));
  // `date` is NOT here — it is a registry slug; `timestamp` is handled as the
  // structural-timestamp type above.
  const TECH_TYPES = /^(var)?char|^(tiny|medium|long)?text$|^(big|small|medium|tiny)?int(eger)?$|^decimal|^numeric|^float|^double|^json$|^blob|^binary|^bool(ean)?$|^datetime$|^string$/i;
  // FK columns = columns participating in a Ref (either endpoint), plus the pk.
  const refColumns = new Set();
  refs.forEach(r => r.endpoints.forEach(ep =>
    (ep.fieldNames || []).forEach(fn => refColumns.add(`${ep.tableName}.${fn}`))
  ));
  tables.forEach(t => {
    t.fields.forEach(f => {
      const typeName = f.type?.type_name ?? '';
      if (STRUCTURAL_TIMESTAMPS.has(f.name)) {
        if (typeName !== 'timestamp')
          warnings.push(`[${t.name}.${f.name}] structural timestamp must be typed \`timestamp\` (found '${typeName}')`);
        return;
      }
      const note = typeof f.note === 'string' ? f.note : '';
      const isIdColumn = f.name === 'id' || refColumns.has(`${t.name}.${f.name}`) || note.includes('external_ref:');
      if (isIdColumn) {
        if (typeName !== 'identifier')
          warnings.push(`[${t.name}.${f.name}] id/FK/external-ref columns are typed \`identifier\` (found '${typeName}')`);
        return;
      }
      if (enumNames.has(typeName)) return;
      if (note.match(/\btype:[A-Za-z]/))
        warnings.push(`[${t.name}.${f.name}] legacy \`// type:{slug}\` note — the business type now IS the column type; move the slug to the type and leave only the business meaning in the note`);
      if (TECH_TYPES.test(typeName)) {
        warnings.push(`[${t.name}.${f.name}] technical type '${typeName}' — the business type IS the column type (e.g. \`email\`, \`money\`, \`name\`); storage is resolved by the Generate binding. Registry: ${registry.path}`);
        return;
      }
      if (!registry.slugs.has(typeName)) {
        warnings.push(`[${t.name}.${f.name}] type '${typeName}' is neither an Enum of this module nor a business-type slug in the registry (${registry.path}). Extend the project registry first.`);
      }
    });
  });
}

// ── 6c. Subdomain-stem redundancy check ─────────────────────────────────────
//
// The Generate phase automatically prepends the subdomain name to every
// generated table/artifact (subdomain `credits` + entity `application`
// → table `credits_application`). If the entity name in DBML already
// contains the subdomain stem, the result is redundant
// (`credits_credit_application`). Flag it here so the name is corrected
// before generation.
//
// Stem derivation:
//   - If the 2nd CLI arg is supplied, use it as the stem (canonical way —
//     the flat docs/plan/ layout carries no module slug in the path).
//   - Else, walk the path segments and find one matching
//     `{NNN}-{slug}` (e.g. `003-credits`) → stem = the part after the
//     numeric prefix (legacy spec-folder layouts only).
//   - Else, skip the check silently.

function deriveStem(absPath, override) {
  if (override) return override.toLowerCase().trim();
  const parts = absPath.split(sep);
  // Match e.g. "003-credits", "012-loan-origination" — take everything
  // after the numeric prefix as the subdomain slug.
  for (const part of parts) {
    const m = part.match(/^\d{1,4}-([a-z0-9][a-z0-9-_]*)$/i);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

function singularize(word) {
  // Light singularization — enough for the common DBML cases
  // (entities are singular by convention; subdomain slugs may be either).
  if (word.endsWith('ies') && word.length > 3) return word.slice(0, -3) + 'y';
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 1) return word.slice(0, -1);
  return word;
}

const subdomainStemFull = deriveStem(absolutePath, stemOverride);
const subdomainStemSingular = subdomainStemFull ? singularize(subdomainStemFull) : null;

if (subdomainStemFull) {
  // Build the set of stem variants to look for as whole-word components
  // in the table name (split on `_`).
  const stems = new Set([subdomainStemFull, subdomainStemSingular].filter(Boolean));

  tables.forEach(t => {
    const tableName = t.name;
    const segments = tableName.toLowerCase().split('_').filter(Boolean);

    for (const stem of stems) {
      if (segments.includes(stem)) {
        const suggested = segments.filter(s => s !== stem).join('_') || tableName;
        warnings.push(
          `WARNING: Table '${tableName}' includes subdomain stem '${stem}' — suggest renaming to '${suggested}'.`
        );
        break;
      }
    }
  });
}

// ── 7. Report ───────────────────────────────────────────────────────────────

console.log('\n── Quality Checks ──────────────────────────────────────────');

if (warnings.length > 0) {
  warnings.forEach(w => console.log(`   ⚠️   ${w}`));
  console.log(`\n   ${warnings.length} warning(s) found`);
  console.log('\n────────────────────────────────────────────────────────────');
  console.log('⚠️   REVIEW (exit 2) — fix warnings before writing docs/plan/dbml.dbml\n');
  if (isTmp) cleanupTmp(absolutePath);
  process.exit(2);
} else {
  console.log('   ✅  All tables have id, created_at, updated_at');
  console.log('   ✅  All tables have Note blocks');
  console.log('   ✅  All tables stamped with their kebab-case entity id');
  console.log('   ✅  All business columns have inline notes (boilerplate exempt)');
  console.log('   ✅  All enum values have notes');
  console.log('   ✅  No suspicious technical column names');
  console.log('\n────────────────────────────────────────────────────────────');
  console.log('✅  PASS (exit 0) — DBML is valid, write docs/plan/dbml.dbml\n');
  if (isTmp) cleanupTmp(absolutePath);
  process.exit(0);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function cleanupTmp(path) {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch { /* ignore cleanup errors */ }
}
