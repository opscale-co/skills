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
//       { "column": "owner_user_id", "contract_slug": "users",    "subdomain": "auth", "table": "users" },
//       { "column": "agency_id",     "contract_slug": "agencies", "subdomain": "crm",  "table": "agencies" }
//     ],
//
//   `contract_slug` is the slug from the data-model.md `external-refs` index.
//   The script derives `contract_class` (StudlyCase + `Contract`) and
//   `relation_method` (see RELATION_METHOD_RULES below) from the column +
//   contract_slug. When `has_cross_refs` is true, the model `use`s the
//   `HasContractRelations` trait + imports `BelongsTo` + imports each unique
//   contract class.
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

const BELONGS_TO_FQN = 'Illuminate\\Database\\Eloquent\\Relations\\BelongsTo';

// Derive the relation method name from a cross-subdomain FK column.
//   *_by             → camelCase + 'User'        (opened_by → openedByUser)
//   *_witness_id     → camelCase qualified prefix (opening_witness_id → openingWitness)
//   *_id             → camelCase prefix          (agency_id → agency, teller_id → teller)
//   anything else    → camelCase(column)
function camel(parts) {
  return parts.map((p, i) => i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');
}
function studly(slug) {
  return slug.split(/[^A-Za-z0-9]+/).filter(Boolean).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');
}
function relationMethodFromColumn(column) {
  const parts = column.split('_');
  if (parts.length >= 2 && parts[parts.length - 1] === 'by') {
    return camel(parts.slice(0, -1)) + 'ByUser';
  }
  if (parts.length >= 3 && parts[parts.length - 1] === 'id' && parts[parts.length - 2] === 'witness') {
    return camel(parts.slice(0, -1));
  }
  if (parts.length >= 2 && parts[parts.length - 1] === 'id') {
    return camel(parts.slice(0, -1));
  }
  return camel(parts);
}

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

  const rawCrossRefs = input.cross_subdomain_refs || [];
  const crossRefs = rawCrossRefs.map(ref => {
    if (!ref.contract_slug) {
      throw new Error(`cross_subdomain_refs entry for column '${ref.column}' is missing contract_slug`);
    }
    const contract_class = `${studly(ref.contract_slug)}Contract`;
    return {
      column:          ref.column,
      contract_slug:   ref.contract_slug,
      contract_class,
      relation_method: ref.relation_method || relationMethodFromColumn(ref.column),
    };
  });
  const hasCrossRefs = crossRefs.length > 0;

  const relationImportsSet = new Set(
    (input.relationships || []).map(r => RELATION_MAP[r.type]?.class).filter(Boolean)
  );
  if (hasCrossRefs) relationImportsSet.add(BELONGS_TO_FQN);
  const relation_imports = Array.from(relationImportsSet).sort();

  const cross_subdomain_contract_imports = Array.from(new Set(
    crossRefs.map(r => `${input.package_namespace}\\Contracts\\${r.contract_class}`)
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
    cross_subdomain_refs:             crossRefs,
    cross_subdomain_contract_imports: cross_subdomain_contract_imports,
    has_cross_refs:                   hasCrossRefs,
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
