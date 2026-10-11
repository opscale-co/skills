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
//     "uri_key":              "orders",                 // raw kebab slug — NOT translated
//     // i18n: `label`/`singular_label` are the KEYS wrapped in __(); the
//     // _en/_es are the values seeded into en.json/es.json. Domain keys are
//     // namespaced `{prefix}.{resource}.{slug}` (ventas.order.title); the
//     // global fixed-UI keys (opscale.details/status/created_at/updated_at)
//     // are supplied by the generator. Legacy callers may pass the English
//     // string as the key (label:"Orders") with just _es — then the key
//     // doubles as the English value.
//     "label":                "ventas.order.label",        // KEY (plural)
//     "label_en":             "Orders",                    // EN plural
//     "label_es":             "Pedidos",                   // ES plural
//     "singular_label":       "ventas.order.singular",     // KEY (singular)
//     "singular_label_en":    "Order",                     // EN singular
//     "singular_label_es":    "Pedido",                    // ES singular
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
//     // Authorization. Each of create/update/delete is:
//     //   true           → allowed; no override method emitted
//     //   false          → emit the override returning false
//     //   { "expr": "…" } → emit the override returning <expr> (PHP already
//     //                     compiled from the entity permission predicate by
//     //                     compilePredicate — see _lib.mjs)
//     "authorize": { "create": true, "update": { "expr": "$this->status === OrderStatus::Draft" }, "delete": false },
//     // Legacy (still accepted): can_create/can_update/can_delete booleans —
//     // false maps to an authorize-deny, true omits the override.
//
//     // Actions registered on this Resource's actions() method. Each renders
//     // `(new {action_class})` with an optional ->canSee(fn () => <expr>).
//     "actions": [
//       { "action_class": "ApproveOrder", "label": "ventas.order.action.approve",
//         "label_en": "Approve", "label_es": "Aprobar",
//         "can_see_expr": "$this->status === OrderStatus::Draft" }
//     ],
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

// Fixed UI strings the template emits literally, under the global `opscale.*`
// namespace. The KEY is what the template wraps in __(); the en/es values are
// seeded into both lang files. Domain labels (resource names, tab names, status
// badge labels, business field labels) carry their OWN namespaced keys supplied
// per resource — they never come from here.
const FIXED_STRINGS = {
  'opscale.details':    { en: 'Details',      es: 'Detalles' },
  'opscale.status':     { en: 'Status',       es: 'Estado' },
  'opscale.created_at': { en: 'Created At',   es: 'Creado en' },
  'opscale.updated_at': { en: 'Updated At',   es: 'Actualizado en' },
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

  // `label` carries the i18n KEY the template wraps in __() (e.g.
  // `ventas.opportunity.tab.quotes`); `label_en`/`label_es` are the values
  // seeded into the lang files. Legacy callers pass only `label_en`/`label_es`
  // (no key) — the English string then doubles as the key.
  const normalizeRelation = (r) => {
    const en  = r.label_en || r.label || r.name;
    const es  = r.label_es || en;
    const key = r.label || r.label_en || r.name;
    return {
      name:              r.name,
      label:             key,
      label_en:          en,
      label_es:          es,
      related_resource:  r.related_resource,
      creatable_from_ui: r.creatable_from_ui !== false, // default: creatable, always visible
      count_column:      r.count_column || `${r.name}_count`,
    };
  };

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

  // --- Authorization -------------------------------------------------------
  // New contract: `authorize: { create, update, delete }`, each one of
  //   true          → allowed; no override method emitted
  //   false         → emit the override returning false
  //   { expr: "…" } → emit the override returning the (already-compiled) PHP
  // Legacy contract: can_create / can_update / can_delete booleans — false maps
  // to an authorize-deny (returns false), true omits the override.
  const authorizeOf = (key, legacyFlag) => {
    const a = input.authorize && input.authorize[key] !== undefined
      ? input.authorize[key]
      : (legacyFlag === false ? false : true);
    if (a === false)                           return { emit: true,  body: 'return false;' };
    if (a && typeof a === 'object' && a.expr)  return { emit: true,  body: `return ${a.expr};` };
    return { emit: false, body: '' }; // true → no override
  };
  const authorize_create = authorizeOf('create', input.can_create);
  const authorize_update = authorizeOf('update', input.can_update);
  const authorize_delete = authorizeOf('delete', input.can_delete);

  // --- Actions -------------------------------------------------------------
  // Each entry: { action_class, label?, label_en?, label_es?, can_see_expr? }.
  // The template registers `(new {action_class})` with an optional
  // `->canSee(fn () => {can_see_expr})`. Labels (when supplied) are seeded so
  // the Action's display name has keys in both lang files.
  const actions = (input.actions || []).map(a => ({
    action_class: a.action_class,
    can_see_expr: a.can_see_expr || '',
  }));
  for (const a of actions) {
    if (!a.action_class) throw new Error('actions[]: every entry needs an action_class');
  }
  const action_imports = [...new Set((input.actions || []).map(a => a.action_class))].sort()
    .map(c => `${input.package_namespace}\\Services\\Actions\\${c}`);

  // Normalize status_badge.labels — accept { case, label (key), label_en,
  // label_es } (new) or { case, label_en, label_es } / { case, label } (legacy).
  // The template wraps `.label` in __(), so `.label` is the i18n KEY.
  const status_badge = input.status_badge || { map: [], labels: [] };
  const status_badge_normalized = {
    map: status_badge.map || [],
    labels: (status_badge.labels || []).map(entry => ({
      case:  entry.case,
      label: entry.label || entry.label_en,
    })),
  };
  const status_badge_label_i18n = (status_badge.labels || []).map(entry => ({
    key: entry.label || entry.label_en,
    en:  entry.label_en || entry.label,
    es:  entry.label_es || entry.label_en || entry.label,
  }));

  // `Str` is imported only when a field uses a `raw` modifier that references
  // it (the long-text index cap displayUsing(... Str::limit ...)).
  const uses_str = businessFields.some(f =>
    (f.modifiers || []).some(m => typeof m === 'object' && m && m.raw && /\bStr::/.test(m.raw)));

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
    authorize_create,
    authorize_update,
    authorize_delete,
    uses_str,
    field_blocks,
    index_field_blocks,
    has_status:               !!input.has_status,
    status_enum:              input.status_enum || '',
    status_badge:             status_badge_normalized,
    has_actions:              actions.length > 0,
    actions,
    action_imports,
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

  // Build the key→{en,es} translation map. The KEY is what the template wraps
  // in __(); domain keys are namespaced (`{prefix}.{resource}.{slug}`), fixed
  // UI keys are global (`opscale.*`). Each key seeds its EN value into en.json
  // and its ES value into es.json.
  const enEntries = new Map();
  const esEntries = new Map();

  function add(key, en, es) {
    if (!key) return;
    if (!enEntries.has(key)) enEntries.set(key, en != null ? en : key);
    if (!esEntries.has(key)) esEntries.set(key, es != null ? es : (en != null ? en : key));
  }

  add(input.label,          input.label_en          || input.label,          input.label_es);
  add(input.singular_label, input.singular_label_en || input.singular_label, input.singular_label_es);

  // Business field labels + help strings. `f.label` is the KEY; `f.label_en`
  // is its English value (legacy: the key doubles as the English string).
  for (const f of businessFields) {
    add(f.label, f.label_en || f.label, f.label_es);
    for (const m of (f.modifiers || [])) {
      if (typeof m === 'object' && m && m.help) {
        add(m.help, m.help_en || m.help, m.help_es || m.help_en || m.help);
      }
    }
  }

  // Fixed UI strings emitted by the template under the global opscale.* keys.
  add('opscale.details',    FIXED_STRINGS['opscale.details'].en,    FIXED_STRINGS['opscale.details'].es);
  add('opscale.created_at', FIXED_STRINGS['opscale.created_at'].en, FIXED_STRINGS['opscale.created_at'].es);
  add('opscale.updated_at', FIXED_STRINGS['opscale.updated_at'].en, FIXED_STRINGS['opscale.updated_at'].es);
  if (input.has_status) add('opscale.status', FIXED_STRINGS['opscale.status'].en, FIXED_STRINGS['opscale.status'].es);

  for (const e of status_badge_label_i18n) add(e.key, e.en, e.es);
  for (const rel of has_many)               add(rel.label, rel.label_en, rel.label_es);
  for (const rel of has_one)                add(rel.label, rel.label_en, rel.label_es);
  for (const a of (input.actions || []))    add(a.label, a.label_en || a.label, a.label_es);

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
  console.log(resultLine('ACTIONS', actions.length));
  const authDesc = (a) => a.emit ? (a.body === 'return false;' ? 'deny' : 'guard') : 'allow';
  console.log(resultLine('AUTHORIZE_CREATE', authDesc(authorize_create)));
  console.log(resultLine('AUTHORIZE_UPDATE', authDesc(authorize_update)));
  console.log(resultLine('AUTHORIZE_DELETE', authDesc(authorize_delete)));
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
