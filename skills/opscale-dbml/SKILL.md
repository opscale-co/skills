---
name: opscale-dbml
description: >
  Generates a DDD-aligned DBML data model from the process spec. Step 2 of
  Plan — runs after opscale-process, before opscale-bpmn. Trigger: "create the
  data model", "generate the DBML", "model the domain", "define the entities".
  Use it whenever the domain data model needs defining, even if just "model this". Not for the process flow (opscale-bpmn) or PHP migrations/models (opscale-domain).
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
| 3 | The spec has its **Normalización de nombres** and **Relaciones** sections | Read spec.md | Return to `/opscale-process` to complete it. |

This skill is **Step 2 of the Plan phase** and must run **AFTER `opscale-process`** and **BEFORE `opscale-bpmn`**. No skipping, no parallel runs with sibling Plan skills.

---

## Operating principle — validate every step, never assume

This is an **interactive** skill. The workflow advances **one phase at a time**, and each phase ends with a confirmation gate. You never:

- Pick a canonical name without checking the project standard
- Introduce an enum, relationship, attribute, type, nullability, or default without it being traceable to the spec **or** confirmed by the user
- Roll multiple phases into one prompt

When something is missing, ambiguous, or would require a guess — **stop and ask**, then integrate the answer.

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

### Phase 1 — Identify entities (reconciled against industry-standard naming)

The spec's **Normalización de nombres** is the module-local proposal — the names the business itself uses. Before locking them as table names, compare each one against **industry-standard / domain best-practice naming** for the same concept. Examples:

- Banking / payments: `Customer`, `Account`, `Transaction`, `Ledger`, `Statement`, `Beneficiary`
- Identity: `User` (auth-only) vs `Member` / `Customer` (business actor with data of its own)
- Inventory: `Product`, `SKU`, `StockItem`, `Warehouse`, `Lot`
- Orders: `Order`, `LineItem`, `Shipment`, `Fulfillment`
- Accounting: `JournalEntry`, `Posting`, `ChartOfAccount`
- Identifiers: `…Id`, `…Number`, `…Code`, `…Reference` — each carries a different meaning, don't conflate

When the spec proposes a name that diverges from the industry standard for the same concept, **do not silently override either side** — surface the divergence and ask. The business name may be the right one (it preserves the operator's language), or the industry standard may be (it makes the model legible to anyone coming from the same domain). The user decides.

**1a — Read the spec proposal:**

```bash
cat .specify/specs/{NNN}-{module-name}/spec.md   # → "Normalización de nombres"
```

**1b — Classify each proposed canonical against the industry standard:**

| Case | What it means | Action |
|---|---|---|
| **Matches the standard** | Spec name == the conventional industry term | Use it; carry on |
| **Synonym / informal variant of a standard term** | Spec proposes `Client` for what the industry calls `Customer`, or `User` for what's actually a `Member` | **Ask**: "Spec uses `Client`; the industry-standard term for this concept is `Customer`. Which should the data model use?" — apply the answer |
| **Overloaded / ambiguous** | Spec uses `User` for a business actor (which industry separates from auth `User`) | **Ask** which concept it is, and which name to use |
| **Domain-specific term with no standard equivalent** | Spec proposes a domain-native name (e.g. `JornadaDeCaja`, `Vale`) | Keep it, but **ask** for an English/standardized equivalent if the codebase mixes languages |

Then filter the reconciled list through the **DDD Scope**: keep business entities, drop technical / config / UI. **Ask before dropping** anything that looks ambiguous (business vs technical).

Present the result and **wait for confirmation**:

```
## Entities (reconciled against industry-standard naming)

1. **Customer**  ← spec: Client (industry-standard term in this domain)
   [One sentence — the business concept]
2. **CashSession**  ← spec: CashSession (kept; no widely-used industry standard for this concept)
   [One sentence]
3. **Member**  ← spec: User (User reserved for auth; Member is the business actor)
   [One sentence]
…

Confirm the entity list? Yes / No / edit
```

Do not proceed to Phase 2 until the user confirms.

---

### Phase 2 — Identify relationships between entities

Now that the entity list is locked, list how those entities relate. For each pair of related entities, determine:

- Is the relationship 1:1, 1:N, or N:M?
- Does the relationship cross subdomain boundaries (→ logical reference, no FK)?
- Does a Business Rule in the spec constrain this relationship?

Trace each relationship to a source in the spec (`Relaciones`, `Flujo ordenado`, Business Rules). **Ask** when cardinality or ownership is ambiguous — do not assume.

Present and **wait for confirmation**:

```
## Entity Relationships

1. **[EntityA] → [EntityB]** (1:N) [SPEC: Relaciones]
   [Business justification — e.g. "one cash session has many transactions"]
2. **[EntityC] ↔ [EntityD]** (N:M) [SPEC: Flujo, steps 4–7]
   Junction table: `[entity_c_entity_d]`
3. **[EntityE] → [OtherSubdomain.EntityF]** (logical reference)
   Cross-subdomain — no FK constraint

Confirm relationships and cardinalities? Yes / No / edit
```

Do not proceed to Phase 3 until the user confirms.

---

### Phase 3 — Identify enums

Only after entities and relationships are locked. Surface every column with a **fixed set of possible values** in any of the entities:

- Status fields derived from spec Triggers, Pre/Post conditions, or Business Rules
- Type / category fields from spec Artifacts notes
- Gateway decisions from the process flow

Do **not** guess values. If the spec doesn't list them, ask.

Present per enum and **wait for confirmation**:

```
## Proposed Enums

1. **[EnumName]** — for [entity].[column]
   Source in spec: [SPEC: Business Rules / Triggers / Post-conditions / Flow]
   Values found in spec: [list, or "none"]
   Missing values? Default value? Please confirm or provide the complete set.

Confirm enums and values? Yes / No / edit
```

Do not proceed to Phase 4 until the user confirms.

---

### Phase 4 — Identify attributes per entity (one entity at a time)

Only after entities, relationships, and enums are locked. Process **one entity at a time**. For each entity, present the full attribute set, justify each non-standard column from the spec, and **wait for confirmation** before moving to the next. Do not infer types, nullability, or defaults — when not explicit in the spec, ask.

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
[ ] Every entity name reconciled with industry-standard naming (or explicitly kept after asking)
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

1. **Metadata everywhere** — the `Project` block, every `Table`, and every field carry a `Note` describing its business meaning. A table or column with no note fails review.

2. **Domain only** — every table must trace to a business entity in `spec.md`.
   If it cannot be traced, it does not belong here.

3. **No technical columns** — reject any column driven by UI, config, or infrastructure:
   - ❌ `is_visible`, `ui_order`, `display_config`, `cache_key`, `sync_token`
   - ✅ `status`, `amount`, `issued_date`, `approved_by`, `reference_number`

4. **Enums over strings** — any column with a finite set of values is an Enum block.
   A `varchar` typed status or category field is a violation.

5. **ULID always** — `varchar(26)`, generated at the application layer. No auto-increment integers.

6. **Logical cross-subdomain references** — store the ID, never the FK constraint.
   Always add a note: `// logical reference to {subdomain}.{table}`.

7. **DBML is the source of truth** — the migration must match the DBML exactly.
   If a migration needs a column not in the DBML, update the DBML first.

8. **Never invent** — do not add entities or columns that cannot be traced to the spec.
   If something seems missing, ask the user before adding it.

---

## Industry-standard naming — heuristics

The reconciliation in Phase 1 is not a lookup against a file in the project — it is a judgment call against **general industry conventions** for the domain at hand. A few rules of thumb to anchor it:

- Prefer the term a developer familiar with the domain (banking, retail, healthcare, ...) would expect to see in a schema.
- Separate **auth identity** (`User`) from **business actor** (`Customer`, `Member`, `Employee`). Same row sometimes, different concepts always.
- Identifiers are not interchangeable: `…Id` (surrogate PK), `…Number` (human-issued sequence), `…Code` (short symbolic key), `…Reference` (external system handle).
- Money: `amount` + `currency`, not `value`. Counts: `quantity`, not `count` (column).
- Time: `…_at` for timestamps, `…_on` for dates, `…_date` only when truly a date label.
- Lifecycle states: prefer `status` (one current state) over scattered booleans (`is_active`, `is_approved`, `is_cancelled`).

When the spec's name is a localized term with no widely-used equivalent (e.g. `Jornada`, `Vale`, `Asiento`), keep it — that's signal, not noise. Just confirm with the user that mixing languages in the schema is intentional.

When in doubt, **ask**. The cost of one extra question is far lower than the cost of an entity named `User` that turns out to mean three different things.

---

## Reference

DBML data types, constraint syntax, and naming conventions live in
`references/dbml-syntax.md` — consult it during Phases 4–6 when you need exact
syntax.
