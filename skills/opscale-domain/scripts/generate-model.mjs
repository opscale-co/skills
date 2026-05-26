#!/usr/bin/env node
// Deterministic generator for a single Eloquent model.
//
// Input JSON shape:
//   {
//     "model_name":        "Order",
//     "table_name":        "orders",
//     "package_namespace": "Opscale\\LoanModule",
//     "output_dir":        "src/Models",
//     "custom_table":      false,                       // emit $table only if name != Laravel default
//     "tenant_aware":      true,
//     "has_soft_deletes":  true,
//     "has_status":        true,
//     "status_enum":       "OrderStatus",
//     "columns": [
//       { "name": "id",         "php_type": "string", "description": "ULID primary key" },
//       { "name": "tenant_id",  "php_type": "string", "description": "Tenant scope (ULID)" },
//       { "name": "status",     "php_type": "OrderStatus", "description": "Lifecycle state" },
//       { "name": "code",       "php_type": "string", "description": "Human code" },
//       { "name": "amount",     "php_type": "MoneyAmount", "description": "Order total" },
//       { "name": "due_at",     "php_type": "\\Illuminate\\Support\\Carbon", "description": "Due date" }
//     ],
//     "fillable":   ["code", "status", "amount", "due_at", "customer_id"],
//     "casts": [
//       { "column": "status", "cast": "OrderStatus::class" },
//       { "column": "amount", "cast": "MoneyAmount::class" },
//       { "column": "due_at", "cast": "'datetime'" }
//     ],
//     "enums":         [{ "class": "OrderStatus" }],
//     "value_objects": [{ "class": "MoneyAmount" }],
//     "relationships": [
//       { "type": "belongsTo", "method": "customer", "model": "Customer", "foreign_key": "customer_id" },
//       { "type": "hasMany",   "method": "items",    "model": "OrderItem" }
//     ],
//     "cross_subdomain_refs": [
//       { "column": "owner_user_id", "subdomain": "auth", "table": "users" }
//     ],
//     "validation_rules": {
//       "code":        ["required", "string", "max:50"],
//       "status":      ["required", "string"],
//       "customer_id": ["required", "string", "ulid"]
//     }
//   }

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonInput, render, writeOrConflict, loadTemplate, resultLine } from './_lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const RELATION_MAP = {
  belongsTo:     { class: 'Illuminate\\Database\\Eloquent\\Relations\\BelongsTo',     ret: 'BelongsTo' },
  hasMany:       { class: 'Illuminate\\Database\\Eloquent\\Relations\\HasMany',       ret: 'HasMany' },
  hasOne:        { class: 'Illuminate\\Database\\Eloquent\\Relations\\HasOne',        ret: 'HasOne' },
  belongsToMany: { class: 'Illuminate\\Database\\Eloquent\\Relations\\BelongsToMany', ret: 'BelongsToMany' },
  morphTo:       { class: 'Illuminate\\Database\\Eloquent\\Relations\\MorphTo',       ret: 'MorphTo' },
  morphMany:     { class: 'Illuminate\\Database\\Eloquent\\Relations\\MorphMany',     ret: 'MorphMany' },
  morphOne:      { class: 'Illuminate\\Database\\Eloquent\\Relations\\MorphOne',      ret: 'MorphOne' },
};

function eloquentCall(rel) {
  const modelRef = `${rel.model}::class`;
  switch (rel.type) {
    case 'belongsTo':
      return rel.foreign_key
        ? `belongsTo(${modelRef}, '${rel.foreign_key}')`
        : `belongsTo(${modelRef})`;
    case 'hasMany':
      return rel.foreign_key
        ? `hasMany(${modelRef}, '${rel.foreign_key}')`
        : `hasMany(${modelRef})`;
    case 'hasOne':
      return rel.foreign_key
        ? `hasOne(${modelRef}, '${rel.foreign_key}')`
        : `hasOne(${modelRef})`;
    case 'belongsToMany':
      return rel.pivot_table
        ? `belongsToMany(${modelRef}, '${rel.pivot_table}')`
        : `belongsToMany(${modelRef})`;
    case 'morphTo':   return `morphTo()`;
    case 'morphMany': return `morphMany(${modelRef}, '${rel.morph_name}')`;
    case 'morphOne':  return `morphOne(${modelRef}, '${rel.morph_name}')`;
    default: throw new Error(`Unknown relationship type: ${rel.type}`);
  }
}

function rulesToPhp(rules) {
  return rules.map(r => `'${r}'`).join(', ');
}

function main() {
  const input = readJsonInput();
  for (const k of ['model_name', 'table_name', 'package_namespace', 'output_dir', 'columns']) {
    if (input[k] === undefined) throw new Error(`Missing required field: ${k}`);
  }

  const property_docs = input.columns.map(c => {
    const pad = Math.max(1, 16 - c.name.length);
    return `${c.php_type} $${c.name}${' '.repeat(pad)}${c.description || ''}`.trimEnd();
  });

  const relation_imports = Array.from(new Set(
    (input.relationships || []).map(r => RELATION_MAP[r.type]?.class).filter(Boolean)
  )).sort();

  const enum_imports = (input.enums || []).map(e => `${input.package_namespace}\\Models\\Enums\\${e.class}`);
  const vo_imports   = (input.value_objects || []).map(v => `${input.package_namespace}\\Models\\ValueObjects\\${v.class}`);

  const relationships = (input.relationships || []).map(r => ({
    method:        r.method,
    return_type:   RELATION_MAP[r.type].ret,
    eloquent_call: eloquentCall(r),
  }));

  const validation_rules = Object.entries(input.validation_rules || {}).map(([column, rules]) => ({
    column,
    rules: rulesToPhp(rules),
  }));

  const context = {
    package_namespace: input.package_namespace,
    model_name:        input.model_name,
    table_name:        input.table_name,
    custom_table:      !!input.custom_table,
    has_soft_deletes:  !!input.has_soft_deletes,
    property_docs,
    relation_imports,
    enum_imports,
    vo_imports,
    validation_rules,
    fillable:           input.fillable || [],
    casts:              input.casts || [],
    relationships,
    has_relationships:  relationships.length > 0,
    cross_subdomain_refs: input.cross_subdomain_refs || [],
    has_cross_refs:     (input.cross_subdomain_refs || []).length > 0,
  };

  const template = loadTemplate(join(__dirname, '..', 'templates', 'model.php.tmpl'));
  const rendered = render(template, context);
  const outPath = resolve(input.output_dir, `${input.model_name}.php`);
  const result = writeOrConflict(outPath, rendered);

  console.log(resultLine('STATUS', result.status));
  console.log(resultLine('GENERATED', result.path));
  if (result.preview) console.log(resultLine('PREVIEW', result.preview));
  console.log(resultLine('MODEL', input.model_name));
  console.log(resultLine('TABLE', input.table_name));
  console.log(resultLine('FILLABLE', context.fillable.length));
  console.log(resultLine('CASTS', context.casts.length));
  console.log(resultLine('RELATIONSHIPS', relationships.length));
  console.log(resultLine('TENANT_AWARE', input.tenant_aware ? 'yes' : 'no'));
  console.log(resultLine('SOFT_DELETES', context.has_soft_deletes ? 'yes' : 'no'));
}

try { main(); } catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}
