#!/usr/bin/env node
// Deterministic generator for a single Laravel migration file.
//
// Input JSON shape:
//   {
//     "table_name":        "orders",
//     "output_dir":        "src/Database/Migrations",
//     "timestamp":         "2024_01_15_120000",
//     "module_prefix":     "crd",                  // optional — overrides constitution lookup; "" means no prefix
//     "constitution_path": ".specify/memory/constitution.md", // optional — explicit constitution path
//     "tenant_aware":      true,
//     "soft_deletes":      false,
//     // `columns` is the FULL ordered field list in dbml authored order,
//     // INCLUDING the foreignKey / externalRef columns (as `ulid` + a
//     // `reference` marker) and EXCLUDING `id` (the template hardcodes the pk)
//     // and the implicit timestamps. The assembler re-sorts it into the one
//     // canonical order (orderFields in _lib.mjs) shared with generate-model.mjs
//     // so the migration columns and the model @property/$fillable AGREE:
//     //   pk → foreignKey/externalRef → authored rest → enum (status) → date.
//     "columns": [
//       { "name": "customer_id", "type": "ulid", "reference": "fk",       "nullable": false },
//       { "name": "owner_id",    "type": "ulid", "reference": "external", "nullable": true,
//         "comment": "logical reference to iam.user — no FK constraint" },
//       { "name": "code",      "type": "string",  "length": 50,    "nullable": false, "unique": true, "default": null, "comment": "Human code." },
//       { "name": "amount",    "type": "decimal", "precision": 12, "scale": 2,        "nullable": false },
//       { "name": "narrative", "type": "text",    "nullable": true },
//       { "name": "status",    "type": "enum",    "default": "Pending" },
//       { "name": "due_at",    "type": "dateTime", "nullable": true }
//     ],
//     // FK CONSTRAINT lines only (the ->foreign() statements). The ulid COLUMN
//     // for each FK is carried in `columns` above with `reference:"fk"`.
//     "foreign_keys": [
//       { "column": "customer_id", "references": "id", "on": "customers", "on_delete": "cascade" }
//     ],
//     // Legacy: external-ref columns may instead be passed here; any whose
//     // `column` is not already in `columns` is folded into the ordered stream.
//     "cross_subdomain_refs": [
//       { "column": "tenant_user_id", "subdomain": "auth", "table": "users", "nullable": true }
//     ],
//     "indexes": [
//       { "columns": ["status", "created_at"], "name": "orders_status_created_idx", "unique": false }
//     ]
//   }
//
// Type mapping (see SUPPORTED_TYPES below).

import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readJsonInput, render, writeOrConflict, loadTemplate, resultLine, orderFields } from './_lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve MODULE_PREFIX from .specify/memory/constitution.md.
//   - explicit input.module_prefix wins (highest precedence)
//   - then OPSCALE_MODULE_PREFIX env var
//   - then parse `**Module Prefix:** {value}` from the constitution
//   - then the unsubstituted `[MODULE_PREFIX]` token (returns '' so the
//     skill notices)
// Returns '' when no prefix can be resolved — the migration is then emitted
// un-prefixed and the skill is expected to surface the issue.
function resolveModulePrefix(input) {
  if (input.module_prefix !== undefined) return String(input.module_prefix);
  if (process.env.OPSCALE_MODULE_PREFIX) return process.env.OPSCALE_MODULE_PREFIX;
  const constitutionPath = input.constitution_path
    ? resolve(input.constitution_path)
    : resolve(input.output_dir, '..', '..', '.specify', 'memory', 'constitution.md');
  if (!existsSync(constitutionPath)) return '';
  const body = readFileSync(constitutionPath, 'utf8');
  const m = body.match(/\*\*Module Prefix:\*\*\s*([A-Za-z0-9_-]+)/);
  if (m && m[1] && m[1] !== '[MODULE_PREFIX]') return m[1];
  return '';
}

function prefixedTable(prefix, table) {
  return prefix ? `${prefix}_${table}` : table;
}

const SUPPORTED_TYPES = new Set([
  'string', 'text', 'longText',
  'integer', 'bigInteger', 'unsignedBigInteger',
  'decimal', 'float',
  'boolean',
  'date', 'dateTime', 'timestamp', 'time',
  'json',
  'ulid', 'uuid',
  'enum', // stored as string per Opscale convention
]);

function columnLine(col) {
  // Reference columns (foreignKey / externalRef) render as an indexed ulid.
  // External refs additionally carry an inline `// logical reference …` comment
  // and never get a ->foreign() constraint (that lives in fk_lines).
  if (col.reference === 'fk' || col.reference === 'external') {
    let base = `$table->ulid('${col.name}')`;
    if (col.nullable === true) base += '->nullable()';
    base += '->index();';
    if (col.reference === 'external') {
      const note = col.comment || `logical reference to ${col.name} — no FK constraint`;
      base += ` // ${note}`;
    }
    return base;
  }

  const type = col.type;
  if (!SUPPORTED_TYPES.has(type)) throw new Error(`Unsupported column type: ${type} (${col.name})`);

  let base;
  switch (type) {
    case 'string':
      base = col.length ? `$table->string('${col.name}', ${col.length})` : `$table->string('${col.name}')`;
      break;
    case 'decimal':
      base = `$table->decimal('${col.name}', ${col.precision ?? 12}, ${col.scale ?? 2})`;
      break;
    case 'enum':
      base = `$table->string('${col.name}')`;
      break;
    default:
      base = `$table->${type}('${col.name}')`;
  }

  if (col.nullable === true) base += '->nullable()';
  if (col.unique === true)   base += '->unique()';
  if (col.default !== undefined && col.default !== null) {
    const def = typeof col.default === 'string' ? `'${col.default}'` : col.default;
    base += `->default(${def})`;
  }
  if (col.index === true) base += '->index()';
  if (col.comment) base += `->comment('${col.comment.replace(/'/g, "\\'")}')`;
  return base + ';';
}

function fkLine(fk) {
  let line = `$table->foreign('${fk.column}')->references('${fk.references || 'id'}')->on('${fk.on}')`;
  if (fk.on_delete === 'cascade')  line += '->cascadeOnDelete()';
  if (fk.on_delete === 'restrict') line += '->restrictOnDelete()';
  if (fk.on_delete === 'set null') line += '->nullOnDelete()';
  return line + ';';
}

function indexLine(idx) {
  const cols = idx.columns.map(c => `'${c}'`).join(', ');
  const method = idx.unique ? 'unique' : 'index';
  const name = idx.name ? `, '${idx.name}'` : '';
  return `$table->${method}([${cols}]${name});`;
}

function main() {
  const input = readJsonInput();
  for (const k of ['table_name', 'output_dir', 'timestamp', 'columns']) {
    if (input[k] === undefined) throw new Error(`Missing required field: ${k}`);
  }

  const modulePrefix = resolveModulePrefix(input);
  const prefixed = prefixedTable(modulePrefix, input.table_name);

  // Build the unified column set in dbml authored order, then apply the ONE
  // canonical order (orderFields) shared with generate-model.mjs. References
  // (foreignKey/externalRef) are columns too — they belong in the ordered
  // stream (pk → references → rest → enum → date), NOT hoisted to the top.
  const presentNames = new Set(input.columns.map(c => c.name));

  // Legacy support: FK / external-ref columns passed as separate arrays whose
  // column is NOT already in `columns` are folded into the stream as refs so a
  // valid migration is still produced (the new contract carries them inline).
  const legacyFkCols = (input.foreign_keys || [])
    .filter(fk => !presentNames.has(fk.column))
    .map(fk => ({ name: fk.column, type: 'ulid', reference: 'fk', nullable: !!fk.nullable }));
  const legacyCrossCols = (input.cross_subdomain_refs || [])
    .filter(r => !presentNames.has(r.column))
    .map(r => ({
      name: r.column, type: 'ulid', reference: 'external', nullable: r.nullable !== false,
      comment: r.comment || `logical reference to ${r.subdomain}.${r.table} — no FK constraint`,
    }));

  const allColumns = orderFields([...input.columns, ...legacyFkCols, ...legacyCrossCols]);
  const column_lines = allColumns.map(columnLine);

  // Intra-subdomain FK CONSTRAINTS reference the prefixed parent table.
  const fk_lines = (input.foreign_keys || []).map(fk => fkLine({
    ...fk,
    on: prefixedTable(modulePrefix, fk.on),
  }));
  const index_lines = (input.indexes || []).map(indexLine);

  const context = {
    table_name:      prefixed,
    tenant_aware:    !!input.tenant_aware,
    soft_deletes:    !!input.soft_deletes,
    column_lines,
    fk_lines,
    index_lines,
    has_intra_fks:   fk_lines.length > 0,
    has_indexes:     index_lines.length > 0,
  };

  const template = loadTemplate(join(__dirname, '..', 'templates', 'migration.php.tmpl'));
  const rendered = render(template, context);
  const filename = `${input.timestamp}_create_${prefixed}_table.php`;
  const outPath = resolve(input.output_dir, filename);
  const result = writeOrConflict(outPath, rendered);

  console.log(resultLine('STATUS', result.status));
  console.log(resultLine('GENERATED', result.path));
  if (result.preview) console.log(resultLine('PREVIEW', result.preview));
  console.log(resultLine('TABLE', prefixed));
  console.log(resultLine('MODULE_PREFIX', modulePrefix || '(none)'));
  console.log(resultLine('COLUMNS', input.columns.length));
  console.log(resultLine('FOREIGN_KEYS', fk_lines.length));
  console.log(resultLine('INDEXES', index_lines.length));
  console.log(resultLine('TENANT_AWARE', context.tenant_aware ? 'yes' : 'no'));
  console.log(resultLine('SOFT_DELETES', context.soft_deletes ? 'yes' : 'no'));
}

try { main(); } catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}
