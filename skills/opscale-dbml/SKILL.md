---
name: opscale-dbml
description: >
  Generates a DDD-aligned DBML data model from a validated Opscale business spec and
  writes it to the spec-kit path ready for downstream skills. Use this skill whenever
  a spec.md exists and the next step is to model the domain data. This is Step 2 in
  the Opscale sequence and must run AFTER opscale-process and BEFORE opscale-bpmn or
  any code generation. Also trigger when the user says "create the data model",
  "model the domain", "generate the DBML", "define the entities", or "let's design
  the database". Never include UI fields, config tables, or infrastructure concerns —
  domain only.
---

# opscale-dbml

## Purpose

Transform a validated business spec into a DBML data model that reflects the real
business domain. The DBML is the authoritative source of truth for the module —
all migrations, models, enums, and repositories are generated from it.

Output is written to `.specify/specs/{NNN}-{module-name}/data-model.md`.

---

## Prerequisites — MUST be satisfied (ordered)

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init` first. |
| 2 | `opscale-process` has been run for this module | `.specify/specs/{NNN}-{module-name}/spec.md` exists and passed its completeness gate (PASS) | Stop. Run `/opscale-process` first. |
| 3 | The spec's Bounded Context section is complete (subdomain slug, responsibility, dependencies) | Read spec.md | Return to `/opscale-process` to complete it. |

This skill is **Step 2 of the Plan phase** and must run **AFTER `opscale-process`** and **BEFORE `opscale-bpmn`**. No skipping, no parallel runs with sibling Plan skills.

---

## Output Location

```
.specify/specs/{NNN}-{module-name}/
├── data-model.md           ← validated DBML wrapped in narrative (this skill's primary output)
└── docs/
    └── initial.dbml        ← raw DBML snapshot at module creation — frozen
```

**Two artifacts, two purposes:**
- `data-model.md` — the **live** DBML for the module. It evolves with every
  iteration; downstream skills (domain, ui, logic) read from here.
- `docs/initial.dbml` — the **frozen** DBML snapshot captured the very first
  time this skill runs for the module. Never modified by future iterations.
  Used to diff against the live model and answer "what has the data model
  drifted to since launch?".

If `docs/initial.dbml` already exists, **do not overwrite it** — it is the
historical baseline. Only write it on first run.

---

## DDD Scope — What Belongs in the Domain Model

**Include ONLY:**
- Business entities — real-world nouns the business cares about (Customer, Order, Contract)
- Domain concepts with lifecycle — things that are created, modified, and queried (Payment, Shipment)
- Actors and roles when they have business data beyond authentication (Employee, Supplier)
- Business documents that persist (Receipt, Certificate, Report record)
- Domain events as entities only when they carry business value that must be stored (Approval, Rejection)

**Exclude ALWAYS:**
- Technical infrastructure: API, Endpoint, Request, Response, Webhook, Queue, Job, Cache, Log, Session
- Configuration: Setting, Config, Parameter, FeatureFlag
- UI/UX: Screen, Page, Form, Button, Modal
- Security infrastructure: Token, Permission (unless Role is a genuine business concept)
- Audit artifacts: AuditLog, ChangeHistory (unless explicitly required by a business rule in the spec)

If an element from the spec is ambiguous — could be technical or business — ask the user:
> *"Is [Element] a business concept users interact with, or a technical component?
> This determines whether it becomes an entity in the data model."*

---

## Workflow

### Phase 1 — Extract candidate entities from spec

Read `spec.md` and scan every section for entities:

| Spec section | What to look for |
|---|---|
| **Artifacts (type Entity)** | Primary source — every Entity artifact becomes a table |
| **Actions** | Verbs that create or modify data — may imply junction tables or status transitions |
| **Business Rules** | Attribute-level rules reveal column constraints; subdomain rules may reveal missing entities |
| **Actors** | Human actors with stored data become entities; system actors do not |
| **Triggers** | Event-based triggers may imply entities that record when something happened |

For each candidate, mark its source: `[SPEC: Artifacts]`, `[SPEC: Actions]`, `[SPEC: Rules]`, etc.

Present the entity list to the user and confirm before continuing:

```
## Candidate Entities

1. **[entity_name]** [SPEC: Artifacts]
   [One sentence — what business concept this represents]

2. **[entity_name]** [SPEC: Actions — implied by "X records Y"]
   [One sentence]

---
Do you confirm these entities? Any to add, remove, or rename?
```

Wait for confirmation before proceeding to Phase 2.

---

### Phase 2 — Define relationships and cardinality

For each pair of related entities, determine:
- Is the relationship 1:1, 1:N, or N:M?
- Does the relationship cross subdomain boundaries?
- Does the spec's Business Rules section constrain this relationship?

Present relationships for confirmation:

```
## Entity Relationships

1. **[EntityA] → [EntityB]** (1:N) [SPEC: Actions]
   [Business justification — e.g. "one invoice can have many line items"]

2. **[EntityC] ↔ [EntityD]** (N:M) [SPEC: Artifacts]
   [Business justification — requires junction table]
   Junction table: `[entity_c_entity_d]`

3. **[EntityE] → [OtherSubdomain.EntityF]** (logical reference)
   [Cross-subdomain — no FK constraint]

---
Do you confirm these relationships and cardinalities?
```

Wait for confirmation before proceeding to Phase 3.

---

### Phase 3 — Define enums

Scan spec for every field with a fixed set of possible values:
- Status fields derived from spec Triggers, Pre/Post conditions, or Business Rules
- Type or category fields from spec Artifacts notes
- Gateway decisions from the process flow

For each enum, ask the user for values if they are not explicit in the spec:

```
## Proposed Enums

1. **[EnumName]** — for [table].[column]
   Source: [SPEC: Business Rules / Triggers / Post-conditions]
   Values from spec: [list if found]
   Missing values? Please confirm or provide the complete set.
```

Wait for confirmation before proceeding to Phase 4.

---

### Phase 4 — Define fields per entity

Process **one entity at a time**. For each entity, present the full field set and wait
for confirmation before moving to the next.

Apply standard columns automatically:

| Column | Type | Rule |
|--------|------|------|
| `id` | `varchar(26)` | ULID — always first |
| `created_at` | `timestamp` | Always |
| `updated_at` | `timestamp` | Always |
| `deleted_at` | `timestamp` | Only if spec requires recovery of deleted records |

**Single-tenant deployment:** Opscale modules use one independent database per
implementation. Domain tables do NOT carry a `tenant_id` column. Cross-customer
isolation is at the database level, not the row level.

Present per entity:

```
## Entity: [table_name]

| Column | Type | Constraints | Business meaning |
|--------|------|-------------|-----------------|
| id | varchar(26) | pk | ULID generated at application layer |
| [column] | [type] | [not null / null] | [what this value means in business terms] |
| [status] | [EnumName] | not null, default:'[value]' | Current lifecycle state |
| [fk_id] | varchar(26) | not null, ref: [table].id | [relationship description] |
| created_at | timestamp | not null | — |
| updated_at | timestamp | not null | — |

Do you confirm the fields for **[table_name]**?
```

Repeat for each entity. Wait for confirmation after each.

---

### Phase 5 — Define indexes

For each table, define indexes following these rules:

- All enum/status/type columns — indexed
- FK columns — indexed automatically by FK definition
- Columns flagged in spec as frequent search targets — indexed
- Composite indexes — only when a specific multi-column query pattern is evident from the spec

---

### Phase 6 — Assemble and validate the DBML

Assemble the complete DBML following the output structure below — **in memory first,
do not write the file yet**.

Then run the bundled validation script directly from the skill directory.
The script is an internal tool — it never gets copied to the project:

```bash
# Install @dbml/core into the skill's own directory (one-time)
cd {SKILL_DIR}/opscale-dbml && npm install @dbml/core --no-save 2>/dev/null

# Write assembled DBML to a temp file
cat > /tmp/.dbml-validate.tmp.md << 'TMPEOF'
[assembled data-model.md content here]
TMPEOF

# Run the validator from the skill directory
node {SKILL_DIR}/opscale-dbml/scripts/validate-dbml.mjs /tmp/.dbml-validate.tmp.md

# Temp file is auto-deleted by the script after validation
```

Where `{SKILL_DIR}` is the directory where the skills are installed
(e.g. `/home/user/.claude/skills` or wherever `opscale-dbml.skill` was unpacked).

**If the script exits with code `1` (syntax error):**
Fix the reported line/column in the assembled DBML, re-write the temp file, re-run.
Do not proceed until exit code is `0`.

**If the script exits with code `2` (quality warnings):**
Fix all reported warnings, re-write the temp file, re-run until exit code is `0`.

**If the script exits with code `0` (pass):**
Proceed to Phase 7 — write the validated DBML to the final output file.
The temp file and the validation script stay outside the project — nothing is added to the repo.

---

### Phase 7 — Write output and close gate

Only reached after the validator exits with code `0`.

Write the validated DBML to the project:
```
.specify/specs/{NNN}-{module-name}/data-model.md
```

**Also write the frozen initial snapshot — first run only:**

```bash
# Extract the raw DBML block (the ```dbml ... ``` fenced section) from the
# assembled data-model.md and write it to docs/initial.dbml — ONLY if the file
# does not already exist.
mkdir -p .specify/specs/{NNN}-{module-name}/docs
[ -f .specify/specs/{NNN}-{module-name}/docs/initial.dbml ] \
  || cp /tmp/.dbml-extracted.dbml .specify/specs/{NNN}-{module-name}/docs/initial.dbml
```

`docs/initial.dbml` contains only the raw DBML — no markdown wrapper, no narrative,
no Data Dictionary. This is the frozen baseline the module launched with.
If the file already exists from a previous run, leave it alone.

The validation script is NOT included in this output. It remains in the skill bundle only.

Then verify the full semantic gate (things the script cannot check automatically):

```
DBML COMPLETENESS GATE
──────────────────────────────────────────────────────
[ ] Script exited with code 0 (syntax + quality pass)
[ ] data-model.md written
[ ] docs/initial.dbml written on first run (or preserved if already present)
[ ] Every Entity artifact from spec.md has a corresponding DBML table
[ ] No technical, UI, or config entities present
[ ] No `tenant_id` columns anywhere (single-tenant deployment model)
[ ] All intra-subdomain relationships have real FK constraints
[ ] All cross-subdomain references are logical only (no FK constraint)
[ ] Data dictionary section is complete for all tables
[ ] Project block and Model Notes block present
[ ] Every entity traceable to a spec section
──────────────────────────────────────────────────────
STATUS: [ ] PASS — opscale-bpmn may proceed
        [ ] FAIL — list blocking items below
```

---

## Output: data-model.md

````markdown
# Data Model: [Module Name]

> Source: `.specify/specs/{NNN}-{module-name}/spec.md`
> Subdomain: [slug]
> Business Domain: [e.g. Sales/Order Management]

---

```dbml
//=====================================
// PROJECT
//=====================================

Project [SubdomainName] {
  database_type: 'MySQL'

  Note: '''
  # Subdomain: [Subdomain Name]

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
  [external_id]   varchar(26)   [not null, note: '// logical reference to {subdomain}.{table} — no FK constraint']

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

---

## Relationships Summary

| From | Cardinality | To | Type | Justification |
|------|------------|-----|------|---------------|
| [table_a] | many-to-one | [table_b] | FK constraint | [from spec section] |
| [table_c] | many-to-one | [subdomain.table] | logical only | cross-subdomain |

---

## Data Dictionary

### [TableName]

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | varchar(26) | Yes | ULID primary key, generated at application layer |
| `[column]` | [type] | Yes/No | [Full business description — what this means, valid range if applicable, where it comes from] |
| `status` | enum | Yes | Current lifecycle state — see [EnumName] for valid values |
| `created_at` | timestamp | Yes | Set at insert, never modified |
| `updated_at` | timestamp | Yes | Updated on every write |

// Repeat for each table
````

---

## Script Installation

The validation script lives at `.specify/scripts/validate-dbml.mjs` in the skill bundle.
When `opscale-init` sets up the project, copy it to the project:

```bash
cp .specify/scripts/validate-dbml.mjs .specify/scripts/validate-dbml.mjs
```

Or run it directly from the skill path:

```bash
node /path/to/opscale-dbml/scripts/validate-dbml.mjs .specify/specs/{NNN}-{slug}/data-model.md
```

---

## Domain Rules

1. **Domain only** — every table must trace to a business entity in `spec.md`.
   If it cannot be traced, it does not belong here.

2. **No technical columns** — reject any column driven by UI, config, or infrastructure:
   - ❌ `is_visible`, `ui_order`, `display_config`, `cache_key`, `sync_token`
   - ✅ `status`, `amount`, `issued_date`, `approved_by`, `reference_number`

3. **Enums over strings** — any column with a finite set of values is an Enum block.
   A `varchar` typed status or category field is a violation.

4. **ULID always** — `varchar(26)`, generated at the application layer. No auto-increment integers.

5. **Logical cross-subdomain references** — store the ID, never the FK constraint.
   Always add a note: `// logical reference to {subdomain}.{table}`.

6. **DBML is the source of truth** — the migration must match the DBML exactly.
   If a migration needs a column not in the DBML, update the DBML first.

7. **Never invent** — do not add entities or columns that cannot be traced to the spec.
   If something seems missing, ask the user before adding it.

---

## Reference: Data Types

| Type | Use for | Example |
|------|---------|---------|
| `varchar(26)` | ULIDs, external IDs | `id varchar(26) [pk]` |
| `varchar(n)` | Short text with known max | `name varchar(200)` |
| `text` | Long text, no max | `description text` |
| `decimal(p,s)` | Money, precise numbers | `amount decimal(10,2)` |
| `boolean` | True/false flags | `is_active boolean` |
| `timestamp` | Date and time | `created_at timestamp` |
| `date` | Date only | `birth_date date` |
| `int` | Counts, quantities | `quantity int` |
| `[EnumName]` | Enum reference | `status OrderStatus` |

## Reference: Constraint Syntax

| Constraint | Syntax |
|------------|--------|
| Primary key | `[pk]` |
| Not null | `[not null]` |
| Nullable | `[null]` |
| Unique | `[unique]` |
| Default value | `[default: 'value']` |
| Default function | `` [default: `now()`] `` |
| FK one-to-many | `[ref: > OtherTable.id]` |
| FK one-to-one | `[ref: - OtherTable.id]` |
| Inline note | `[note: 'description']` |

## Reference: Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Tables | plural snake_case | `loan_applications`, `payment_records` |
| Columns | snake_case | `created_at`, `total_amount` |
| Enums | PascalCase | `OrderStatus`, `PaymentMethod` |
| Enum values | snake_case | `in_progress`, `pending_payment` |
| Junction tables | [table_a]_[table_b] | `order_items_toppings` |
| Indexes | `idx_{table}_{column}` | `idx_orders_tenant` |
