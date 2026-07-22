# Output templates — `final/domain.dbml` + `final/external-refs.md`

## `final/domain.dbml`

Raw DBML — no markdown fence, no narrative wrapper, no Data Dictionary table. The Project block's `Note:` carries all the relationship summary, business rules, bounded-context info, and entity-source traceability.

```dbml
//=====================================
// PROJECT
//=====================================

Project [SubdomainName] {
  database_type: 'MySQL'

  Note: '''
  # Subdomain: [Subdomain Name]
  Source spec: .specify/specs/{NNN}-{module-name}/final/process.md
  Modeling standard: [name, e.g. "BIAN" / "HL7 FHIR" / "schema.org Order"] — or "none"

  [3–5 sentences describing what this subdomain owns, what processes it covers,
  and where its boundaries are. Written for a developer reading this cold.]

  ## Bounded Context
  - Core entities: [list]
  - Main aggregates: [AggregateRoot → owned entities]
  - Depends on: [other subdomains, or "none"]
  - Notifies: [other subdomains via events, or "none"]

  ## Key Business Rules
  - [BR-01]: [condition → consequence]
  - [BR-02]: ...

  ## Relationship Summary
  - [table_a] → [table_b]: 1:N, FK constraint (within subdomain)
  - [table_c] → [other_subdomain.table]: logical reference, no FK

  ## Entity Sources
  - [SPEC: Artifacts]: [entity1], [entity2]
  - [SPEC: Actions]: [entity3]
  - [SPEC: Rules]: [entity4]
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
  id              varchar(26)   [pk, note: 'ULID generated at application layer before insert']

  // --- Business attributes ---
  [column]        [type]        [not null, note: 'Business meaning of this value']
  [status]        [EnumName]    [not null, default: 'pending', note: 'Current lifecycle state']

  // --- Intra-subdomain relationships ---
  [parent_id]     varchar(26)   [ref: > parent_table.id, not null, note: 'Owning [entity]']

  // --- Cross-subdomain logical references ---
  [external_id]   varchar(26)   [not null, note: '// external_ref:{slug} | {subdomain}.{table} — no FK constraint']

  created_at      timestamp     [not null]
  updated_at      timestamp     [not null]
  // deleted_at   timestamp     [null]  // uncomment only if soft deletes required by spec

  indexes {
    status                          [name: 'idx_[table]_status']
    // [search_column]              [name: 'idx_[table]_[column]']
  }

  Note: '''
  [2–4 sentences. What is this entity, what does it represent in the business,
  what is its role in the aggregate, key behaviors or lifecycle.]
  '''
}

//=====================================
// JUNCTION TABLES
//=====================================

Table [entity_a]_[entity_b] {
  [entity_a_id]   varchar(26)   [ref: > entity_a.id, not null, note: 'Reference to [EntityA]']
  [entity_b_id]   varchar(26)   [ref: > entity_b.id, not null, note: 'Reference to [EntityB]']

  indexes {
    ([entity_a_id], [entity_b_id])  [pk]
  }

  Note: '''
  Links [EntityA] with [EntityB] for [business reason].
  '''
}

// Aggregates, business rules, relationships and entity sources go into the
// Project block's Note: above — NOT into a separate `Note model { }` block.
// Current versions of @dbml/core REJECT `Note model { }` at the top level
// with: «Expected Table Group, comment, end of input, enum, project, references,
// table, or whitespace but "N" found.» Do not add it.
```

## `final/external-refs.md`

````markdown
# External references — [Module Name]

```external-refs
{contract_slug}: {column_a}, {column_b}, ...
users:     opened_by, closed_by, witness_id, requested_by
agencies:  agency_id
```
````
