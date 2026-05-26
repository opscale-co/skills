#!/usr/bin/env node
/**
 * opscale-dbml — Internal DBML Validator
 *
 * INTERNAL SKILL TOOL — do not copy to projects.
 * Runs from the skill bundle directory during skill execution.
 * Temp files are auto-deleted after validation.
 *
 * Extracts the DBML code block from a data-model.md (or temp) file and validates
 * it using @dbml/core. Reports syntax errors with line numbers and quality warnings.
 *
 * Usage:
 *   node validate-dbml.mjs <path-to-file.md>
 *
 * Examples:
 *   # Validate a temp draft before writing the final file
 *   node validate-dbml.mjs .specify/specs/001-loans/.data-model.tmp.md
 *
 *   # Validate the final output
 *   node validate-dbml.mjs .specify/specs/001-loans/data-model.md
 *
 * Exit codes:
 *   0 — PASS: no syntax errors, no quality warnings
 *   1 — FAIL: syntax error (do not write output file)
 *   2 — REVIEW: syntax valid but quality warnings found (fix before writing)
 *
 * Requirements:
 *   npm install @dbml/core
 */

import { readFileSync, unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';

// ── 1. Read the file ────────────────────────────────────────────────────────

const filePath = process.argv[2];

if (!filePath) {
  console.error('❌  Usage: node validate-dbml.mjs <path-to-data-model.md>');
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

// ── 2. Extract the DBML block from Markdown ─────────────────────────────────

const match = raw.match(/```dbml\n([\s\S]*?)```/);

if (!match) {
  console.error('❌  No ```dbml ... ``` code block found in the file.');
  console.error('    Make sure the file contains a fenced DBML block.');
  if (isTmp) cleanupTmp(absolutePath);
  process.exit(1);
}

const dbml = match[1];
const lineCount = dbml.split('\n').length;

console.log(`\n📄  File  : ${filePath}${isTmp ? ' (draft)' : ''}`);
console.log(`📏  Lines : ${lineCount}\n`);

// ── 3. Import @dbml/core ────────────────────────────────────────────────────

let Parser;
try {
  ({ Parser } = await import('@dbml/core'));
} catch {
  console.error('❌  @dbml/core is not installed.');
  console.error('    Run: npm install @dbml/core');
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

// ── 7. Report ───────────────────────────────────────────────────────────────

console.log('\n── Quality Checks ──────────────────────────────────────────');

if (warnings.length > 0) {
  warnings.forEach(w => console.log(`   ⚠️   ${w}`));
  console.log(`\n   ${warnings.length} warning(s) found`);
  console.log('\n────────────────────────────────────────────────────────────');
  console.log('⚠️   REVIEW (exit 2) — fix warnings before writing data-model.md\n');
  if (isTmp) cleanupTmp(absolutePath);
  process.exit(2);
} else {
  console.log('   ✅  All tables have id, created_at, updated_at');
  console.log('   ✅  All tables have Note blocks');
  console.log('   ✅  All business columns have inline notes (boilerplate exempt)');
  console.log('   ✅  All enum values have notes');
  console.log('   ✅  No suspicious technical column names');
  console.log('\n────────────────────────────────────────────────────────────');
  console.log('✅  PASS (exit 0) — DBML is valid, write data-model.md\n');
  if (isTmp) cleanupTmp(absolutePath);
  process.exit(0);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function cleanupTmp(path) {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch { /* ignore cleanup errors */ }
}
