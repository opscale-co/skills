---
name: opscale-dbml
description: >
  Generates a DDD-aligned DBML data model from the process spec. Step 2 of
  Plan — runs after opscale-process, before opscale-bpmn. Trigger: "create the
  data model", "generate the DBML", "model the domain", "define the entities".
  Use it whenever the domain data model needs defining, even if just "model this". Not for the process flow (opscale-bpmn) or PHP migrations/models (opscale-domain).
---

# opscale-dbml

## Context

### Purpose

Transform a validated business spec into a DBML data model that reflects the real business domain. The DBML is the authoritative source of truth for the module — all migrations, models, enums, and repositories are generated from it.

`opscale-process` captured the module **as it runs today** — possibly with manual steps, ad-hoc names, and workarounds. `opscale-dbml` models the **systematized to-be**: a coherent schema fit for a software system. The two are not the same shape, and this skill is where the gap is reconciled — by aligning the spec against a domain standard when one applies, and limiting, renaming, merging, or reformulating entities and relationships accordingly.

Outputs are written to `.specify/specs/{NNN}-{module-name}/final/domain.dbml` (raw DBML), `final/external-refs.md` (external-ref index), `final/naming.md` (name-lineage table), and `.specify/specs/{NNN}-{module-name}/logs/dbml.md` (phase-by-phase Q/A record). Canonical paths: `skills/opscale-init/references/artifact-paths.md`.

### Prerequisites — MUST be satisfied (ordered)

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init` first. |
| 2 | `opscale-process` has been run for this module | `.specify/specs/{NNN}-{module-name}/final/process.md` exists and passed its completeness gate (PASS) | Stop. Run `/opscale-process` first. |
| 3 | The spec has its **Name normalization** and **Relations** sections | Read `final/process.md` | Return to `/opscale-process` to complete it. |

This skill is **Step 2 of the Plan phase** and must run **AFTER `opscale-process`** and **BEFORE `opscale-bpmn`**. No skipping, no parallel runs with sibling Plan skills.

### Subdomain name is an implicit prefix

**Terminology:** in the Opscale ontology, **subdomain = module** — one business process, one spec directory. Do not confuse it with a **subprocess**, which is a wait-bounded segment *inside* the module's flow (see `final/process.md` *Ordered flow*). This skill uses "subdomain" only in the module sense.

The subdomain name (the module's slug — `loans`, `kyc`, `credits`, `loyalty`, …) is **automatically prepended** by `opscale-domain` to every table, migration, model, and file name it generates downstream. Entity names declared here in DBML must therefore NEVER include the subdomain stem.

| Subdomain | DBML entity | Generated table | Verdict |
|---|---|---|---|
| `credits` | `application` | `credits_application` | Correct |
| `credits` | `credit_application` | `credits_credit_application` | Redundant — `credit` is already implicit |
| `loans` | `loan` | `loans_loan` | Redundant |
| `loans` | `disbursement` | `loans_disbursement` | Correct |
| `kyc` | `verification` | `kyc_verification` | Correct |

**Why:** when developers add the subdomain stem to entity names as a "collision-avoidance" hack, the hack leaks into business naming everywhere downstream — DBML is harder to read, models become `CreditApplication` instead of `Application`, repositories double up the noun (`CreditApplicationRepository`), and stakeholders reviewing the spec see `credit_credit_application` in generated artifacts. The subdomain prefix is structural; the entity name is business — keep them separate.

When the spec from `opscale-process` proposes an entity name that already contains the subdomain stem, strip it and **confirm with the user** before locking the name in Phase 1.

### Operating principle — validate every step, never assume

This is an **interactive** skill. The workflow advances **one phase at a time**, and each phase ends with a confirmation gate. You never:

- Pick a canonical name without checking the project standard
- Introduce an enum, relationship, attribute, type, nullability, or default without it being traceable to the spec **or** confirmed by the user
- Roll multiple phases into one prompt

When something is missing, ambiguous, or would require a guess — **stop and ask**, then integrate the answer.

### Industry-standard naming — the per-entity rule for attribute presentation

The reconciliation in Phase 1 is not a lookup against a file in the project — it is a judgment call against **general industry conventions** for the domain at hand. A few rules of thumb to anchor it:

- Prefer the term a developer familiar with the domain (banking, retail, healthcare, ...) would expect to see in a schema.
- Separate **auth identity** (`User`) from **business actor** (`Customer`, `Member`, `Employee`). Same row sometimes, different concepts always.
- Identifiers are not interchangeable: `…Id` (surrogate PK), `…Number` (human-issued sequence), `…Code` (short symbolic key), `…Reference` (external system handle).
- Money: `amount` + `currency`, not `value`. Counts: `quantity`, not `count` (column).
- Time: `…_at` for timestamps, `…_on` for dates, `…_date` only when truly a date label.
- Lifecycle states: prefer `status` (one current state) over scattered booleans (`is_active`, `is_approved`, `is_cancelled`).

When the spec's name is a localized term with no widely-used equivalent (e.g. `Jornada`, `Vale`, `Asiento`), keep it — that's signal, not noise. Just confirm with the user that mixing languages in the schema is intentional.

When in doubt, **ask**. The cost of one extra question is far lower than the cost of an entity named `User` that turns out to mean three different things.

**Attribute presentation rule:** Phase 5 processes **one entity at a time** — presenting attributes for many entities at once collapses user attention. The user confirms by reflex instead of actually reviewing. Stop-gate: do not advance to the next entity until the current entity's attributes are confirmed.

### Output Location

```
.specify/specs/{NNN}-{module-name}/
├── logs/
│   └── dbml.md             ← phase-by-phase Q/A record from this run
└── final/
    ├── domain.dbml         ← the canonical, raw DBML (downstream skills read this)
    ├── external-refs.md    ← external-ref index, fenced external-refs block
    └── naming.md           ← name-lineage table (business name → table → enums)
```

**Four artifacts, four purposes:**
- `final/domain.dbml` — **raw DBML**, no markdown wrapper, no narrative, no Data Dictionary table. Parseable directly by `@dbml/core`. This is the live model downstream skills (domain, ui, logic) read.
- `logs/dbml.md` — phase-by-phase record of what was asked and answered during this run (Phase 0 standard choice, Phase 1 entity confirmations, Phase 2 external-reference declarations, Phase 3 relationship confirmations, Phase 4 enum confirmations, Phase 5 per-attribute answers, Phase 6 index decisions, Phase 8 external-ref index cross-check). Replaced on each re-run. Use the shared skeleton at `skills/opscale-process/assets/log-template.md`.
- `final/external-refs.md` — companion index emitted in Phase 8; structured list of cross-subdomain columns grouped by contract slug, in a fenced `external-refs` block. `opscale-domain` reads this file to generate contract interfaces and virtual `BelongsTo` methods.
- `final/naming.md` — name-lineage table built from the Phase 1 reconciliation: one row per entity mapping the canonical business name (as it appears in `process.md` *Name normalization*) to the DBML table and its enums. `opscale-domain` later appends the generated model class per row. This is the artifact that keeps management, users, and developers looking at the same concept under one traceable name — the reconciliation must not die in the logs.

### DDD Scope — what belongs in the domain model

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
> *"Is [Element] a business concept users interact with, or a technical component? This determines whether it becomes an entity in the data model."*

### Domain Rules

1. **Metadata everywhere** — the `Project` block, every `Table`, and every field carry a `Note` describing its business meaning. A table or column with no note fails review.

2. **Domain only** — every table must trace to a business entity in `final/process.md`. If it cannot be traced, it does not belong here.

3. **No technical columns** — reject any column driven by UI, config, or infrastructure:
   - bad: `is_visible`, `ui_order`, `display_config`, `cache_key`, `sync_token`
   - good: `status`, `amount`, `issued_date`, `approved_by`, `reference_number`

4. **Enums over strings** — any column with a finite set of values is an Enum block. A `varchar` typed status or category field is a violation.

5. **ULID always** — `varchar(26)`, generated at the application layer. No auto-increment integers.

6. **Logical cross-subdomain references** — store the ID, never the FK constraint. The column note MUST follow the structured form `// external_ref:{contract_slug} | {subdomain}.{table}` (e.g. `// external_ref:users | auth.users`, `// external_ref:agencies | crm.agencies`). `opscale-domain` parses `external_ref:{slug}` to generate the contract, trait wiring, and virtual `BelongsTo` method. The free-text portion after `|` is for human reference only.

7. **DBML is the source of truth** — the migration must match the DBML exactly. If a migration needs a column not in the DBML, update the DBML first.

8. **Never invent** — do not add entities or columns that cannot be traced to the spec. If something seems missing, ask the user before adding it.

9. **Business types over raw types** — before typing any column as a bare `varchar`/`text`/`decimal`, check the central **language-agnostic registry** (`.specify/memory/business-types.md`, fallback: `skills/opscale-init/references/business-types.md`). If a business type matches (email, money, phone, url, quantity, …), use its **storage mapping** for the DBML column type and add the structured note `// type:{slug}` (e.g. `// type:email`). **Why:** a bare `varchar` for an email drops the format validation and the correct UI capture — the business type carries the full semantics, and Generate-phase skills resolve `type:{slug}` through the stack binding to apply them. The DBML stays implementation-agnostic: only the slug appears, never a framework class or rule string. Precedence: **external ref** (column owned elsewhere) > **Enum** (closed, module-owned value set) > **business type** (universal format) > raw type (only when nothing matches — and consider proposing a new registry entry first).

### Output templates

`final/domain.dbml` is raw DBML — no markdown fence, no narrative wrapper, no Data Dictionary table. The Project block's `Note:` carries the relationship summary, business rules, bounded-context info, and entity-source traceability. `final/external-refs.md` is a fenced `external-refs` block listing each contract slug and its columns.

For the verbatim DBML skeleton (Project block, Enum block, Table block with intra-subdomain FK + cross-subdomain logical ref + indexes + Note, junction table) and the `external-refs.md` fenced block shape, see `references/output-templates.md`. **Aggregates, business rules, relationships, and entity sources go into the Project block's Note — NOT into a separate `Note model { }` block** (current `@dbml/core` rejects it).

For the validator script install/run details, see `references/validator.md`. DBML data types, constraint syntax, and naming conventions live in `references/dbml-syntax.md` — consult it during Phases 5–7 when you need exact syntax.

## Steps

### Phase 0 — Choose modeling standard (authorization gate)

The spec from `opscale-process` describes the **as-is** — how the area works today, often with manual steps and the operator's own vocabulary. The DBML must describe the **to-be systematized** model. Before touching the entity list, decide whether to align it to a known domain standard. The choice made here governs Phases 1–5: entities, external references, relationships, enums, and attributes from the spec will be **limited, renamed, merged, or reformulated** to fit it.

Examples of standards by domain (use only as orientation — the right one depends on the module):

| Domain | Common standards / reference models |
|---|---|
| Banking, payments | BIAN, ISO 20022 |
| Retail | ARTS, GS1 |
| Healthcare | HL7 FHIR |
| Supply chain, logistics | SCOR, GS1 EPCIS |
| Identity / IAM | SCIM |
| Accounting | REA, double-entry, IFRS chart-of-accounts |
| E-commerce orders | schema.org Order vocabulary |
| HR | HR-XML / HROpen |
| Education | IMS, OneRoster |
| Insurance | ACORD |

Ask the user:

```
The process spec describes how this module works today — possibly with manual
steps and informal names. The DBML must model the systematized version.

Should I align the data model to a known domain standard?

- Yes, use [standard]  → I will reconcile entities, names, relationships,
  enums, and attributes against it. Entities outside its scope will need
  a decision (drop, keep as module-specific extension, or fold into a
  standard entity).
- No                   → fall back to general industry naming conventions
  (judgment per concept, current behavior).

Which standard, or none?
```

Record the chosen standard (or "none") in two places:

1. **Working notes** for the rest of this run — it governs phases 1–5.
2. **`final/domain.dbml` Project block Note**, on a line of its own at the top:
   `Modeling standard: [name, e.g. "BIAN" / "HL7 FHIR" / "schema.org Order"] — or "none"`.
   This is the source of truth that `opscale-bpmn` will read in its Phase 1 to reconcile the as-is subprocesses against the same standard. Without it, downstream skills cannot align.

| If the user chose… | Phases 1–5 must… |
|---|---|
| A specific standard | Reconcile against that standard's vocabulary, relationships, code lists, and attributes. Any spec entity with no counterpart in the standard requires an explicit decision (drop / extend / fold). Deviations from the standard require justification. |
| No standard | Apply the general industry-naming heuristics (judgment per concept, ask on ambiguity). |

**Wait for user approval before continuing.**

### Phase 1 — Identify entities (reconciled against the chosen standard)

The spec's **Name normalization** is the module-local proposal — the names the business itself uses. Before locking them as table names, compare each one against the standard chosen in Phase 0 (or, if none was chosen, against **industry-standard / domain best-practice naming** for the same concept). Examples:

- Banking / payments: `Customer`, `Account`, `Transaction`, `Ledger`, `Statement`, `Beneficiary`
- Identity: `User` (auth-only) vs `Member` / `Customer` (business actor with data of its own)
- Inventory: `Product`, `SKU`, `StockItem`, `Warehouse`, `Lot`
- Orders: `Order`, `LineItem`, `Shipment`, `Fulfillment`
- Accounting: `JournalEntry`, `Posting`, `ChartOfAccount`
- Identifiers: `…Id`, `…Number`, `…Code`, `…Reference` — each carries a different meaning, don't conflate

When the spec proposes a name that diverges from the industry standard for the same concept, **do not silently override either side** — surface the divergence and ask. The business name may be the right one (it preserves the operator's language), or the industry standard may be (it makes the model legible to anyone coming from the same domain). The user decides.

**1a — Read the spec proposal:**

```bash
cat .specify/specs/{NNN}-{module-name}/final/process.md   # → "Name normalization"
```

**1b — Classify each proposed canonical against the chosen standard (or industry conventions if none):**

| Case | What it means | Action |
|---|---|---|
| **Matches the standard** | Spec name == the standard's term for this concept | Use it; carry on |
| **Synonym / informal variant of a standard term** | Spec proposes `Client` where the standard says `Customer`, or `User` where it's actually a `Member` / `Party` | **Ask**: "Spec uses `Client`; the standard's term for this concept is `Customer`. Which should the data model use?" — apply the answer |
| **Overloaded / ambiguous** | Spec uses `User` for a business actor (which the standard separates from auth `User`) | **Ask** which concept it is, and which name to use |
| **Outside the standard's scope** | Spec proposes an entity the standard does not cover (manual workaround, ad-hoc artifact, side-process record) | **Ask**: drop it (was an as-is artifact, not needed in the systematized model), keep it as a module-specific extension, or fold it into a standard entity? |
| **Domain-specific term with no standard equivalent** | Spec proposes a domain-native name (e.g. `JornadaDeCaja`, `Vale`) and the standard says nothing about it | Keep it, but **ask** for a standardized equivalent if the codebase mixes languages |

Then filter the reconciled list through the **DDD Scope**: keep business entities, drop technical / config / UI. **Ask before dropping** anything that looks ambiguous (business vs technical).

Present the result:

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

**Wait for user approval before continuing.**

### Phase 2 — Identify external references (virtual models)

Before mapping relationships between the entities locked in Phase 1, surface every entity this module needs to **reference but does NOT own**. These are **virtual models** — they live in another subdomain / package / external system, are never declared as `Table` blocks here, and never get a real FK constraint. The host application binds the actual implementation at runtime through a contract.

Classic examples: `User` (lives in the auth/IAM package), `Agency` / `Branch` (lives in the corporate CRM), `Country` (lives in a shared geo catalog), `Currency` (FX package). The local domain stores only the ID; the consuming app resolves it.

If `.specify/memory/domain-map.md` exists (written by `opscale-map`), read its **Cross-module references** table first and propose owners from it — the map already knows which module owns each contract slug. New slugs declared here must be reported back to `opscale-map` on its next run.

**Ask the user explicitly** — do not infer from Phase 1 entities:

```
Which entities does this module need to REFERENCE but NOT own?

These are records that live in another subdomain / package / external system.
The module will store their ID in cross-subdomain columns; the host application
binds the contract at runtime. Examples: User (auth), Agency (CRM), Country (geo),
Currency (FX).

For each external reference, give me:
- A canonical singular name (StudlyCase, business name, e.g. User, Agency, Country)
- A contract slug (kebab-case plural, e.g. users, agencies, countries) — becomes
  the `external_ref:{slug}` token on every column that references it AND the
  contract class name (UsersContract, AgenciesContract, …)
- The owning subdomain + table it maps to in the source system (e.g. auth.users,
  crm.agencies) — for documentation only; no FK is generated

Or: "none" if this module references no external entities.
```

Present the result:

```
## External references (virtual models)

1. **User**  → contract slug `users`  → maps to `auth.users`
   [One sentence — what role this external concept plays in the module]
2. **Agency**  → contract slug `agencies`  → maps to `crm.agencies`
   [One sentence]
3. **Country**  → contract slug `countries`  → maps to `geo.countries`
   [One sentence]
…

Confirm the external-reference list? Yes / No / edit
```

The confirmed list governs everything downstream:

- **Phase 3 (relationships)** — any pair where one side is in this list is **cross-subdomain** (logical reference, no FK constraint). Pairs where both sides are in the Phase 1 entity list are intra-subdomain (real FK).
- **Phase 5 (attributes)** — any column that points at an external reference MUST carry the structured note `// external_ref:{slug} | {subdomain}.{table}` using the slug confirmed here. The skill rejects any new contract slug invented during Phase 5 — go back and amend Phase 2 if a missing reference shows up.
- **Phase 8 (emit external-ref index)** — `final/external-refs.md` is built directly from this list cross-checked against the actual columns that ended up using each slug. A slug declared here with zero referencing columns is flagged (likely a typo or a forgotten attribute); a column with a slug not declared here fails validation.

**Wait for user approval before continuing.**

### Phase 3 — Identify relationships between entities

Now that the entity list is locked, list how those entities relate. For each pair of related entities, determine:

- Is the relationship 1:1, 1:N, or N:M?
- Does the relationship cross subdomain boundaries (→ logical reference, no FK)?
- Does a Business Rule in the spec constrain this relationship?

Trace each relationship to a source in the spec (`Relations`, `Ordered flow`, Business Rules). **Ask** when cardinality or ownership is ambiguous — do not assume.

Present:

```
## Entity Relationships

1. **[EntityA] → [EntityB]** (1:N) [SPEC: Relations]
   [Business justification — e.g. "one cash session has many transactions"]
2. **[EntityC] ↔ [EntityD]** (N:M) [SPEC: Ordered flow, steps 4–7]
   Junction table: `[entity_c_entity_d]`
3. **[EntityE] → [OtherSubdomain.EntityF]** (logical reference)
   Cross-subdomain — no FK constraint

Confirm relationships and cardinalities? Yes / No / edit
```

Cross-subdomain rows must reference an entity confirmed in Phase 2. If a candidate cross-subdomain target is not in that list, stop and go back to Phase 2 to add it.

**Wait for user approval before continuing.**

### Phase 4 — Identify enums

Only after entities and relationships are locked. Surface every column with a **fixed set of possible values** in any of the entities:

- Status fields derived from spec Triggers, Pre/Post conditions, or Business Rules
- Type / category fields from spec Artifacts notes
- Gateway decisions from the process flow

Do **not** guess values. If the spec doesn't list them, ask.

Present per enum:

```
## Proposed Enums

1. **[EnumName]** — for [entity].[column]
   Source in spec: [SPEC: Business Rules / Triggers / Post-conditions / Flow]
   Values found in spec: [list, or "none"]
   Missing values? Default value? Please confirm or provide the complete set.

Confirm enums and values? Yes / No / edit
```

**Wait for user approval before continuing.**

### Phase 5 — Identify attributes per entity (one entity at a time)

Only after entities, relationships, and enums are locked. Process **one entity at a time**. For each entity, present the full attribute set, justify each non-standard column from the spec, and **wait for confirmation** before moving to the next. Do not infer types, nullability, or defaults — when not explicit in the spec, ask.

**Why one entity at a time:** presenting attributes for many entities at once collapses user attention — they confirm by reflex instead of actually reviewing. A table of 60 columns across 8 entities gets a "looks good" the same way a table of 6 columns across 1 entity gets a careful read. Attribute decisions (nullability, defaults, enum values, FK direction) are the highest-leverage decisions in the whole skill — they materialize one-for-one into migrations and models — so they earn the user's full attention, entity by entity.

**Stop-gate: do not advance to the next entity until the current entity's attributes are confirmed.** If the user says "all of them look fine, move on" mid-Phase 5, push back: present them one at a time anyway. The cost of one extra prompt round is far lower than the cost of regenerating migrations because column types drifted.

For each attribute, resolve its type in the Domain Rule 9 precedence order: external ref → Enum → **business type from the registry** (`// type:{slug}` note + storage mapping from `.specify/memory/business-types.md`) → raw type. Present the chosen business type per attribute so the user sees what behavior it implies (validation semantics, UI intent).

Apply standard columns automatically (`id` ULID first, `created_at`/`updated_at` always, `deleted_at` only if spec requires recovery). **Single-tenant deployment:** Opscale modules use one database per implementation — domain tables NEVER carry a `tenant_id` column.

For the standard-columns table and the per-entity prompt template, see `references/attribute-taxonomy.md`.

Repeat the per-entity prompt for each entity. Wait for confirmation after each.

**Wait for user approval before continuing.**

### Phase 6 — Define indexes

For each table, define indexes following these rules:

- All enum/status/type columns — indexed
- FK columns — indexed automatically by FK definition
- Columns flagged in spec as frequent search targets — indexed
- Composite indexes — only when a specific multi-column query pattern is evident from the spec

**Wait for user approval before continuing.**

### Phase 7 — Assemble and validate the DBML

Assemble the complete raw DBML following the output structure (see `references/output-templates.md`) **in memory first — do not write the file yet**. Then run the bundled validator from the skill directory (it never gets copied to the project): exit code `0` = pass, `1` = syntax error (fix & re-run), `2` = quality warnings (fix all & re-run). Do not proceed until exit code is `0`.

For the verbatim install + run commands and exit-code handling, see `references/validator.md`.

**Wait for user approval before continuing.**

### Phase 8 — Emit external-ref index

`final/domain.dbml` is **raw DBML** and stays parser-clean. The external-ref index ships as a sibling markdown file: `final/external-refs.md`. Build it from the **Phase 2 declaration**, then cross-check against actual column notes: for every contract slug declared in Phase 2, list the columns whose DBML note carries `external_ref:{slug}`:

````markdown
# External references — [Module Name]

```external-refs
{contract_slug}: {column_a}, {column_b}, ...
users:     opened_by, closed_by, witness_id, requested_by
agencies:  agency_id
```
````

Rules:

- Every slug listed here MUST have been declared in Phase 2 (no slug invented during Phase 5 sneaks in).
- Every contract slug declared in Phase 2 SHOULD appear here — if a slug has zero referencing columns, flag it to the user (likely a typo or a forgotten attribute).
- Every column with `external_ref:{slug}` in its DBML note MUST appear here.
- Every column listed here MUST have `external_ref:{slug}` in its DBML note.
- One line per slug; columns comma-separated; column order follows DBML order.

This file is the **single source of truth** that `opscale-domain` reads to generate the contract interfaces and the model's virtual `BelongsTo` methods. Downstream skills do NOT re-scan the DBML notes — they read this file only.

**Wait for user approval before continuing.**

### Phase 9 — Write output and close gate

Only reached after the validator exits with code `0`.

Create the `logs/` and `final/` directories if they don't exist, then write all three artifacts:

```bash
mkdir -p .specify/specs/{NNN}-{module-name}/logs .specify/specs/{NNN}-{module-name}/final
```

1. **`final/domain.dbml`** — the validated raw DBML (no markdown wrapper, no narrative, no Data Dictionary). Parseable directly by `@dbml/core`.
2. **`final/external-refs.md`** — the external-refs index from Phase 8.
3. **`final/naming.md`** — the name-lineage table, one row per Phase 1 entity plus one per external reference:

   ```markdown
   # Naming lineage — {Module Name}

   | Canonical (process.md) | DBML table | Enums | Model class |
   |---|---|---|---|
   | Cash session | cash_session | CashSessionStatus | *(opscale-domain fills this)* |
   | Internal user | external_ref:users | — | *(virtual — contract UsersContract)* |
   ```

   The **Model class** column is left as a placeholder — `opscale-domain` appends it when it generates the classes.
4. **`logs/dbml.md`** — phase-by-phase Q/A record from this run (Phases 0–7) using the skeleton at `skills/opscale-process/assets/log-template.md`.

All four files are replaced if they exist. The validation script stays in the skill bundle — never copied to the project.

Then verify the full semantic gate (things the script cannot check automatically). For the full checklist (16 items: modeling-standard recorded, external-refs declared, script exit `0`, all three files written, every spec entity reconciled, no `tenant_id`, etc.), see `references/validator.md`. The skill must walk it item-by-item before declaring PASS — `opscale-bpmn` only proceeds on PASS.

**Wait for user approval before continuing.**

## Sample

Excerpt of `final/domain.dbml` — see `references/sample-output.md`.

## Success condition

```bash
node skills/opscale-dbml/scripts/validate-dbml.mjs final/domain.dbml
```

Exit code 0 = pass.
