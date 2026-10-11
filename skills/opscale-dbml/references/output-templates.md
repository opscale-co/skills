# Output templates — `docs/plan/dbml.dbml` + `docs/plan/context/external-refs.md`

## `docs/plan/dbml.dbml`

Raw DBML — no markdown fence, no narrative wrapper, no Data Dictionary table. The Project block's `Note:` carries only the subdomain description, the modeling standard, and the bounded-context info. No business rules (defined per Action by `opscale-sipoc`), no relationship summary (relationships are the formal `Ref:` lines), no entity-source list.

```dbml
//=====================================
// PROJECT
//=====================================

Project [SubdomainName] {
  database_type: 'MySQL'

  Note: '''
  # Subdomain: [Subdomain Name]
  Source spec: docs/plan/process.json
  Modeling standard: [name, e.g. "BIAN" / "HL7 FHIR" / "schema.org Order"] — or "none"

  [3–5 sentences describing what this subdomain owns, what processes it covers,
  and where its boundaries are. Written for a developer reading this cold.]

  ## Bounded Context
  - Core entities: [list]
  - Main aggregates: [AggregateRoot → owned entities]
  - Depends on: [other subdomains, or "none"]
  - Notifies: [other subdomains via events, or "none"]
  '''
}

//=====================================
// ENUMS
//=====================================

Enum [TablePrefix]Status {
  pending    [note: 'Created, not yet processed']
  approved   [note: 'Reviewed and accepted']
  rejected   [note: 'Reviewed and declined']
  cancelled  [note: 'Cancelled before completion']
}

// One Enum block per fixed-set field

//=====================================
// TABLES
//=====================================

Table [plural_entity_name] {
  id              identifier    [pk, note: 'ULID generated at application layer before insert']

  // --- Business attributes (the business type IS the column type — never varchar/text/decimal) ---
  [column]        [type-slug]   [not null, note: 'Business meaning of this value']
  [status]        [EnumName]    [not null, default: 'pending', note: 'Current lifecycle state']

  // --- Intra-subdomain relationships ---
  [parent_id]     identifier    [ref: > parent_table.id, not null, note: 'Owning [entity]']

  // --- Cross-subdomain logical references (named by ROLE in this module, never {entity}_id) ---
  [role_name]     identifier    [not null, note: '// external_ref:{slug} | {subdomain}.{table} — no FK constraint']
  // e.g. requested_by, approved_by, assigned_to — the external entity's name is uncertain; the role here is not

  created_at      timestamp     [not null]
  updated_at      timestamp     [not null]
  // deleted_at   timestamp     [null]  // uncomment only if soft deletes required by spec

  indexes {
    status                          [name: 'idx_[table]_status']
    // [search_column]              [name: 'idx_[table]_[column]']
  }

  Note: '''
  [kebab-entity-id] — [2–4 sentences. What is this entity, what does it
  represent in the business, its role in the aggregate, key behaviors or
  lifecycle. The kebab id is exactly this table's name with dashes
  (invoice_item → invoice-item) — the Note MUST open with it; the validator
  enforces the id ↔ table match.]
  '''
}

//=====================================
// JUNCTION TABLES
//=====================================

Table [entity_a]_[entity_b] {
  [entity_a_id]   identifier    [ref: > entity_a.id, not null, note: 'Reference to [EntityA]']
  [entity_b_id]   identifier    [ref: > entity_b.id, not null, note: 'Reference to [EntityB]']

  indexes {
    ([entity_a_id], [entity_b_id])  [pk]
  }

  Note: '''
  [entity-a]-[entity-b] — Links [EntityA] with [EntityB] for [business reason].
  [The junction's id is its own table name in kebab-case — names.md is not
  touched (it carries no ids).]
  '''
}

// The bounded-context info goes into the Project block's Note: above — NOT
// into a separate `Note model { }` block.
// Current versions of @dbml/core REJECT `Note model { }` at the top level
// with: «Expected Table Group, comment, end of input, enum, project, references,
// table, or whitespace but "N" found.» Do not add it.
```

## `docs/plan/context/external-refs.md`

````markdown
# External references — [Module Name]

```external-refs
{contract_slug}: {column_a}, {column_b}, ...
users:     opened_by, closed_by, witness_id, requested_by
agencies:  origin_agency_id
```
````
