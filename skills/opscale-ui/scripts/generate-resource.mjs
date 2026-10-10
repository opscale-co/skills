#!/usr/bin/env node
// Deterministic generator for a single Nova Resource class.
//
// Input JSON shape:
//   {
//     "model_name":           "Order",
//     "package_namespace":    "Opscale\\LoanModule",
//     "output_dir":           "src/Nova",
//     "title_column":         "code",                // descriptive column — NEVER "id"
//     "search_columns":       ["code"],
//     "uri_key":              "orders",
//     "label":                "Orders",                 // EN plural — contextual
//     "singular_label":       "Order",                  // EN singular — contextual
//     "label_es":             "Pedidos",                // ES plural — contextual
//     "singular_label_es":    "Pedido",                 // ES singular — contextual
//
//     // Business fields — rendered inline in fields() (full set). Flag the
//     // most-relevant, cheap-to-render ones with `on_index: true` to place
//     // them in fieldsForIndex() (relationship fields are rejected there —
//     // they cause N+1 on the index).
//     "fields": [
//       {
//         "field":     "Text",                 // Nova field class
//         "label":     "Code",                 // EN — required
//         "label_es":  "Código",               // ES — required
//         "attribute": "code",
//         "on_index":  true,                   // optional — include in fieldsForIndex()
//         "modifiers": [ "sortable", { "rules": "code" } ]
//       },
//       { "field": "Select", "label": "Type", "label_es": "Tipo", "attribute": "type",
//         "enum_class": "OrderType", "modifiers": ["filterable", "displayUsingLabels"] },
//       { "field": "BelongsTo", "label": "Customer", "label_es": "Cliente", "attribute": "customer",
//         "related_resource": "Customer", "modifiers": ["searchable"] },
//       { "field": "VirtualSelect", "label": "Counterparty", "label_es": "Contraparte",
//         "attribute": "counterparty_id", "contract_class": "CounterpartyContract",
//         "modifiers": ["searchable", "filterable", "displayUsingLabels"] },
//       { "field": "Textarea", "label": "Notes", "label_es": "Notas", "attribute": "notes",
//         "modifiers": ["hideFromIndex"] }
//     ],
//
//     "has_status":           true,
//     "status_enum":          "OrderStatus",
//     "status_badge": {
//       "map":    [{ "case": "Pending", "color": "warning" }, ...],
//       "labels": [{ "case": "Pending", "label_en": "Pending", "label_es": "Pendiente" }, ...]
//     },
//     "has_many_relationships": [
//       {
//         "name":              "items",
//         "label_en":          "Items",
//         "label_es":          "Artículos",
//         "related_resource":  "OrderItem",
//         "creatable_from_ui": true,            // → tab always visible; otherwise hidden when count=0
//         "count_column":      "items_count"    // optional; defaults to "{name}_count"
//       }
//     ],
//     "has_one_relationships": [                 // optional — rendered as HasOne tabs, same shape
//       {                                        //   as has_many but the field is HasOne(...)->onlyOnDetail()
//         "name":              "contractTerms",
//         "label_en":          "Contract Terms",
//         "label_es":          "Términos del contrato",
//         "related_resource":  "ContractTerms",
//         "creatable_from_ui": true,
//         "count_column":      "contract_terms_count"
//       }
//     ],
//     "count_strategy":     "with",              // "with" → public static $with; "index" → indexQuery withCount
//
//     "child_of": {                              // optional — when set, redirectAfterCreate is emitted
//       "parent_uri":  "applications",           // uriKey() of the parent root Resource
//       "foreign_key": "application_id"          // column on this aggregate that points to the parent
//     },
//
//     "can_create": true,     // optional — default true; when false, emit authorizedToCreate
//     "can_update": true,     // optional — default true; when false, emit authorizedToUpdate
//     "can_delete": true,     // optional — default true; when false, emit authorizedToDelete
//
//     "lang_dir": "lang"      // optional — defaults to <project_root>/lang (derived from output_dir)
//   }
//
// Tab structure is applied automatically when has_many/has_one_relationships is
// non-empty. Each tab gets a `->canSee(...)` guard when its relation is NOT
// creatable_from_ui (per references/aggregate-tabs.md).
//
// Cross-subdomain logical refs are declared as `VirtualSelect` business fields
// (never a separate top-level array). See references/virtual-relations.md.
//
// Translation seeding: appends to BOTH `{lang_dir}/en.json` AND
// `{lang_dir}/es.json`:
//   - the resource label and singular label (per locale)
//   - each business field label (per locale) + each `{ help }` modifier
//   - each status badge label (per locale, when has_status)
//   - each HasMany/HasOne tab label (per locale)
//   - fixed UI strings ("Details", "Created At", "Updated At", "Status")
//     resolved from the built-in EN/ES dictionary
// Existing keys are never overwritten. ES-only or EN-only seeding is NOT
// supported — both files are seeded in one pass.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readJsonInput, render, writeOrConflict, loadTemplate, resultLine, seedTranslations,
  FIELD_NAMESPACE, RELATION_FIELDS, renderFieldBlock,
} from './_lib.mjs';

// EN → ES dictionary for fixed UI strings. The dictionary is intentionally
// small — it only covers labels the generator emits literally. Domain labels
// (resource names, tab names tied to entities, status badge labels, enum
// option labels, business field labels) are always user-supplied per locale.
const FIXED_STRINGS = {
  'Details':     { en: 'Details',      es: 'Detalles' },
  'Status':      { en: 'Status',       es: 'Estado' },
  'Created At':  { en: 'Created At',   es: 'Creado en' },
  'Updated At':  { en: 'Updated At',   es: 'Actualizado en' },
};

function resolveLangDir(input) {
  if (input.lang_dir) return resolve(input.lang_dir);
  // output_dir is typically <project>/src/Nova → two levels up is <project>.
  return resolve(input.output_dir, '..', '..', 'lang');
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function main() {
  const input = readJsonInput();
  for (const k of ['model_name', 'package_namespace', 'output_dir', 'title_column', 'uri_key', 'label', 'singular_label', 'fields']) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }
  // $title MUST be a descriptive business column — never the primary id.
  if (input.title_column === 'id') {
    throw new Error("title_column must be a descriptive business column, never 'id'.");
  }
  // ES labels are required — EN-only is no longer accepted.
  if (!input.label_es)           throw new Error('Missing required field: label_es (Spanish plural label)');
  if (!input.singular_label_es)  throw new Error('Missing required field: singular_label_es (Spanish singular label)');
  if (!Array.isArray(input.fields)) throw new Error('fields must be an array (may be empty).');

  const modelName = input.model_name;

  // --- Business fields -----------------------------------------------------
  const businessFields = input.fields;
  for (const f of businessFields) {
    if (!FIELD_NAMESPACE[f.field]) throw new Error(`Unsupported Nova field: ${f.field} (attribute '${f.attribute}')`);
    if (!f.label)    throw new Error(`Field for attribute '${f.attribute}' is missing label`);
    if (!f.label_es) throw new Error(`Field for attribute '${f.attribute}' is missing label_es (Spanish label)`);
    if (f.field === 'Select' && !f.enum_class) {
      throw new Error(`Select field for attribute '${f.attribute}' is missing enum_class`);
    }
    if (f.field === 'VirtualSelect' && !f.contract_class) {
      throw new Error(`VirtualSelect field for attribute '${f.attribute}' is missing contract_class`);
    }
    if ((f.field === 'BelongsTo' || f.field === 'MorphTo') && !f.related_resource) {
      throw new Error(`${f.field} field for attribute '${f.attribute}' is missing related_resource`);
    }
  }

  const normalizeRelation = (r) => ({
    name:              r.name,
    label:             r.label_en || r.label || r.name,
    label_es:          r.label_es || r.label_en || r.label || r.name,
    related_resource:  r.related_resource,
    creatable_from_ui: r.creatable_from_ui !== false, // default: creatable, always visible
    count_column:      r.count_column || `${r.name}_count`,
  });

  const has_many = (input.has_many_relationships || []).map(normalizeRelation);
  const has_one  = (input.has_one_relationships  || []).map(normalizeRelation);
  const has_tabs = has_many.length > 0 || has_one.length > 0;

  // Continuation indent for chained modifiers: 4 spaces deeper than the head.
  // Head sits at 20 spaces inside a Details tab, 12 spaces in a flat array.
  const fieldsContIndent = has_tabs ? ' '.repeat(24) : ' '.repeat(16);
  const indexContIndent  = ' '.repeat(16); // fieldsForIndex head is at 12 spaces

  const field_blocks = businessFields.map(f => renderFieldBlock(f, modelName, fieldsContIndent));

  // fieldsForIndex — only fields flagged on_index; relationship fields rejected
  // (they resolve per-row and cause N+1 on the index).
  let indexFields = businessFields.filter(f => f.on_index);
  if (indexFields.length === 0) {
    // Default: the title column, when it is one of the declared fields.
    indexFields = businessFields.filter(f => f.attribute === input.title_column);
  }
  for (const f of indexFields) {
    if (RELATION_FIELDS.has(f.field)) {
      throw new Error(`Field '${f.attribute}' is a ${f.field} relationship and cannot appear on the index (N+1). Remove on_index.`);
    }
  }
  const index_field_blocks = indexFields.map(f => renderFieldBlock(f, modelName, indexContIndent));

  // Eager loads: by default, every child relation is added to $with so the
  // _count column is available for the canSee guard. Callers can switch to
  // indexQuery-based loading via count_strategy: "index".
  const count_strategy = input.count_strategy === 'index' ? 'index' : 'with';
  const all_relation_names = [...has_many, ...has_one].map(r => r.name);
  const with_relations    = count_strategy === 'with'  ? all_relation_names : [];
  const index_with_count  = count_strategy === 'index' ? all_relation_names : [];

  // --- Imports -------------------------------------------------------------
  const fieldImports = new Set([
    'Laravel\\Nova\\Fields\\DateTime', // timestamps always emitted
  ]);
  if (input.has_status) fieldImports.add('Laravel\\Nova\\Fields\\Badge');
  if (has_many.length)  fieldImports.add('Laravel\\Nova\\Fields\\HasMany');
  if (has_one.length)   fieldImports.add('Laravel\\Nova\\Fields\\HasOne');
  for (const f of businessFields) fieldImports.add(FIELD_NAMESPACE[f.field]);
  const field_imports = [...fieldImports].sort();

  const enumSet = new Set();
  for (const f of businessFields) if (f.field === 'Select' && f.enum_class) enumSet.add(f.enum_class);
  const enum_imports = [...enumSet].sort().map(e => `${input.package_namespace}\\Models\\Enums\\${e}`);

  const relResSet = new Set();
  for (const f of businessFields) {
    if ((f.field === 'BelongsTo' || f.field === 'MorphTo') && f.related_resource) relResSet.add(f.related_resource);
  }
  for (const r of [...has_many, ...has_one]) relResSet.add(r.related_resource);
  const related_resource_imports = [...relResSet].sort()
    .map(r => `${input.package_namespace}\\Nova\\${r}`);

  const contractSet = new Set();
  for (const f of businessFields) if (f.field === 'VirtualSelect' && f.contract_class) contractSet.add(f.contract_class);
  const contract_imports = [...contractSet].sort()
    .map(c => `${input.package_namespace}\\Contracts\\${c}`);

  const can_create = input.can_create !== false; // default true
  const can_update = input.can_update !== false;
  const can_delete = input.can_delete !== false;

  // Normalize status_badge.labels — accept either { case, label } (legacy
  // EN-only) or { case, label_en, label_es } (new). Template still reads
  // `.label`, so we project to that field; the ES copy is seeded separately
  // into the lang file below.
  const status_badge = input.status_badge || { map: [], labels: [] };
  const status_badge_normalized = {
    map: status_badge.map || [],
    labels: (status_badge.labels || []).map(entry => ({
      case:  entry.case,
      label: entry.label_en || entry.label,
    })),
  };
  const status_badge_es_labels = (status_badge.labels || []).map(entry => ({
    en: entry.label_en || entry.label,
    es: entry.label_es || entry.label_en || entry.label,
  }));

  const child_of = input.child_of && input.child_of.parent_uri && input.child_of.foreign_key
    ? { parent_uri: input.child_of.parent_uri, foreign_key: input.child_of.foreign_key }
    : null;

  const context = {
    package_namespace:        input.package_namespace,
    model_name:               modelName,
    title_column:             input.title_column,
    search_columns:           input.search_columns || [input.title_column],
    uri_key:                  input.uri_key,
    label:                    input.label,
    singular_label:           input.singular_label,
    can_create,
    can_update,
    can_delete,
    field_blocks,
    index_field_blocks,
    has_status:               !!input.has_status,
    status_enum:              input.status_enum || '',
    status_badge:             status_badge_normalized,
    has_many_relationships:   has_many,
    has_one_relationships:    has_one,
    has_tabs,
    field_imports,
    enum_imports,
    related_resource_imports,
    contract_imports,
    has_with:                 with_relations.length > 0,
    with_relations,
    has_index_with_count:     index_with_count.length > 0,
    index_with_count,
    child_of,
  };

  const template = loadTemplate(join(__dirname, '..', 'templates', 'resource.php.tmpl'));
  const rendered = render(template, context);
  const outPath = resolve(input.output_dir, `${modelName}.php`);
  const result = writeOrConflict(outPath, rendered);

  // Build per-locale translation maps. The key is the English string the
  // template emits inside __(). The value is the translation for the target
  // locale.
  const enEntries = new Map();
  const esEntries = new Map();

  function add(en, es) {
    if (!en) return;
    if (!enEntries.has(en)) enEntries.set(en, en);
    if (!esEntries.has(en)) esEntries.set(en, es || en);
  }

  add(input.label,          input.label_es);
  add(input.singular_label, input.singular_label_es);

  // Business field labels + help strings.
  for (const f of businessFields) {
    add(f.label, f.label_es);
    for (const m of (f.modifiers || [])) {
      if (typeof m === 'object' && m && m.help) add(m.help, m.help_es || m.help);
    }
  }

  // Fixed UI strings emitted by the template.
  for (const key of ['Details', 'Created At', 'Updated At']) {
    add(key, FIXED_STRINGS[key].es);
  }
  if (input.has_status) add('Status', FIXED_STRINGS['Status'].es);

  for (const entry of status_badge_es_labels) add(entry.en, entry.es);
  for (const rel of has_many)                 add(rel.label, rel.label_es);
  for (const rel of has_one)                  add(rel.label, rel.label_es);

  const langDir = resolveLangDir(input);
  const enResult = seedTranslations(langDir, 'en', enEntries);
  const esResult = seedTranslations(langDir, 'es', esEntries);

  console.log(resultLine('STATUS', result.status));
  console.log(resultLine('GENERATED', result.path));
  if (result.preview) console.log(resultLine('PREVIEW', result.preview));
  console.log(resultLine('RESOURCE', modelName));
  console.log(resultLine('MODEL', `${input.package_namespace}\\Models\\${modelName}`));
  console.log(resultLine('FIELDS', businessFields.length));
  console.log(resultLine('INDEX_FIELDS', index_field_blocks.length));
  console.log(resultLine('TABS', has_tabs ? 1 + has_many.length + has_one.length : 0));
  console.log(resultLine('HAS_MANY', has_many.length));
  console.log(resultLine('HAS_ONE', has_one.length));
  console.log(resultLine('STATUS_BADGE', input.has_status ? 'yes' : 'no'));
  console.log(resultLine('CAN_CREATE', can_create ? 'yes' : 'no'));
  console.log(resultLine('CAN_UPDATE', can_update ? 'yes' : 'no'));
  console.log(resultLine('CAN_DELETE', can_delete ? 'yes' : 'no'));
  console.log(resultLine('CHILD_OF', child_of ? `${child_of.parent_uri}.${child_of.foreign_key}` : '(root)'));
  console.log(resultLine('COUNT_STRATEGY', count_strategy));
  console.log(resultLine('LANG_EN_PATH',  enResult.path));
  console.log(resultLine('LANG_EN_ADDED', enResult.added.length));
  console.log(resultLine('LANG_ES_PATH',  esResult.path));
  console.log(resultLine('LANG_ES_ADDED', esResult.added.length));
}

try { main(); } catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}
