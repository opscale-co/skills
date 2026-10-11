---
name: opscale-dbml
description: >
  Generates a DDD-aligned DBML data model from the process spec. Step 2 of
  Plan — runs after opscale-process, before opscale-bpmn. Trigger: "create the
  data model", "generate the DBML", "model the domain", "define the entities".
  Use it whenever the domain data model needs defining, even if just "model this". Not for the process flow (opscale-bpmn) or the technical data layer (opscale-domain).
---

# opscale-dbml

## Context

### Purpose

Transform a validated business spec into a DDD data model fit for a software system. The validated source of truth is **`docs/plan/dbml.json`**; the raw **`docs/plan/dbml.dbml`** (the ER diagram downstream skills read) is a deterministic projection of it — never hand-edited.

`opscale-process` captured the module **as it runs today** — manual steps, ad-hoc names, workarounds. `opscale-dbml` models the **systematized to-be**: a coherent schema. The two are not the same shape, and this skill reconciles the gap — aligning the spec to a domain standard when one applies, and limiting, renaming, merging, or reformulating entities and relationships accordingly.

**Entity ids are born here.** The final entities that survive the Phase 2 reconciliation each receive their **kebab-case entity id** (the `code`, ≡ the table name with dashes). It opens the table's `Note` in the projection and the generated class's `@entity` docblock — the name lineage lives in the artifacts, rendered by `opscale-graph`.

### The JSON contract

`dbml.json` is validated against `schema/dbml.schema.json` (which `$ref`s the shared `common.schema.json`). The schema is a hard gate. Shape:

```jsonc
{
  // NO `module` block — only process.json carries module (software/domain/subdomain);
  // dbml derives the subdomain from the sibling process.json at render time.
  "prefix": "ventas",                                  // MODULE_PREFIX — prepended downstream; never repeat it in entity codes
  "standards": { "modeling": "...", "process": "...", "notes": "..." },   // modeling required; the analysis CONCLUSION only
  "enums": [ { "code": "quote_status", "name": "...", "values": [ { "value": "draft", "description": "..." } ] } ],
  "entities": [ {
    "code": "quote-line",                   // = slugify(name); table name is the code with '-'→'_'
    "name": "Quote line",
    "description": "...",
    "fields": [ {                           // order: pk first, then foreign/external refs, then the rest
      "code": "quote_id", "description": "...", "nullable": false,
      // EXACTLY ONE typing: type | enum | foreignKey | externalRef
      "foreignKey": "quote"                 // intra-module → `identifier [ref: > quote.id]`
    }, {
      "code": "subtotal", "type": "money", "description": "...",
      "calculated": true                    // derived by the system — never captured as input
    } ],
    "permissions": { "create": "true", "update": "status = draft", "delete": "false" },   // all three; predicate grammar
    "relationships": [ { "type": "belongs_to", "target": "quote", "field": "quote_id", "description": "..." } ]  // ≥1
  } ]
}
```

Hard schema rules: `prefix` and `standards.modeling` present (there is **no `terminology` block** — name normalization is analysis that stays in `names.md`; `dbml.json` holds only the conclusion); every entity has `code`/`name`/`description`/`fields`/`permissions`/`relationships` (relationships **minItems 1**); `permissions` requires create+update+delete (predicate grammar); each field has **exactly one** of `type`/`enum`/`foreignKey`/`externalRef`; an optional `calculated: true` marks a derived field; `type` ∈ the business-type registry; each enum value has a `description`; **no audit codes** in fields (`created_at`/`updated_at`/`created_by`/`updated_by`/`deleted_at` are forbidden — the renderer appends `created_at`/`updated_at` automatically).

Semantic rules the schema can't express (checked by the validator): fields ordered pk → foreign/external refs → the rest, with exactly one `pk` (the `id identifier`); a `calculated` field is never a pk or a reference; `foreignKey`/`enum` refs resolve in-doc; `externalRef` slugs appear in `context/external-refs.md`; permission predicates reference real fields and real enum values; `code == slugify(name)`; no `tenant_id` anywhere.

### Prerequisites

| # | Requirement | If missing |
|---|-------------|-----------|
| 1 | `opscale-process` ran for this module (`docs/plan/process.json` present, passed) | Stop. Run `/opscale-process` first. |
| 2 | Name normalization `docs/plan/context/names.md` exists | Return to `/opscale-process` to complete it. |

Optional but recommended: `docs/plan/context/system.map.md` (from `opscale-map`) — the catalog of sibling modules to resolve external references against. Step 2 of Plan: run **after** `opscale-process`, **before** `opscale-bpmn`.

### Modes

- **Writable project folder:** write outputs directly to `docs/plan/`.
- **Chat-only session:** produce the same files as downloadable outputs, each labeled with its destination path.

The agent-run validation gate (Phase 9) is mandatory in both.

### How this skill runs — context, per-item questions, generate, validate

One hard rule: **nothing is generated until every piece is confirmed, and nothing advances past a phase whose gate has not passed.** The heavy, non-interactive work is delegated to sub-agents; only the interview stays in the main conversation:

- **Phase 0 — Load context (agent).** Read `docs/plan/` + `context/names.md` + `context/system.map.md`, return a compact summary.
- **Phases 1–7 — Interview (main conversation, one item at a time).** Each phase ends in an explicit **"Wait for user approval before continuing."** Attributes and permissions are confirmed **one entity at a time** — never dump the whole model at once.
- **Phase 8 — Generate (agent).** Author `dbml.json` and run `render-dbml.mjs` to project `dbml.dbml`.
- **Phase 9 — Validate (agent).** Run `validate-dbml.mjs`. A failed gate is fixed and re-run, never silently patched.

### Language rule — structural keys English, content in the user's language

JSON keys, entity `code`s, field `code`s, and enum `value`s are canonical English/ASCII snake/kebab. Everything the stakeholder reads — `description`s, enum value descriptions, `standards.notes` — follows the input language.

### Subdomain name is an implicit prefix

**subdomain = module.** The `prefix` (the module slug — `ventas`, `loans`, `kyc`) is **prepended by the Generate phase** to every table. Entity `code`s must never include the prefix stem (`credits` + `application` → table `credits_application`; never `credit_application`). When the spec proposes a name that already carries the stem, strip it and confirm before locking in Phase 2.

### DDD Scope — what belongs in the domain model

**Include only:** business entities (real-world nouns), domain concepts with a lifecycle, actors/roles with business data beyond auth, business documents that persist, domain events that must be stored.

**Exclude always:** technical infrastructure (API, Request, Webhook, Queue, Job, Cache, Log, Session), configuration (Setting, Config, FeatureFlag), UI/UX (Screen, Form, Button), security infra (Token, Permission unless Role is genuine business), audit artifacts (AuditLog unless a business rule requires it).

If an element is ambiguous (business vs technical), ask: *"Is [Element] a business concept users interact with, or a technical component?"*

### Modeling standards — the reconciliation anchor

Phase 1 decides whether to align the model to a known domain standard (BIAN/ISO 20022 for banking; ARTS/GS1 for retail; HL7 FHIR for healthcare; SCOR/GS1 EPCIS for logistics; SCIM for IAM; REA/double-entry for accounting; schema.org Order for e-commerce; HR-XML/HROpen for HR; IMS/OneRoster for education; ACORD for insurance). The choice governs Phases 2–6 and is recorded in `standards.modeling` — downstream skills read it to align. If no standard applies, fall back to general industry-naming heuristics (separate auth `User` from business actor; `…Id`/`…Number`/`…Code`/`…Reference` are distinct; `amount`+`currency` not `value`; `status` over scattered booleans; `…_at`/`…_on` time conventions). When a spec term is a localized domain-native word with no standard equivalent, keep it — that is signal, not noise — and confirm mixing languages is intentional.

### Field typing — the business type IS the column type

Every field resolves to **exactly one** typing key:
- `type` — a **business-type slug** from the registry (`email`, `money`, `name`, `date`, `identifier`, …), written directly. No technical storage types (`varchar`, `int`, `json`) ever. The registry (`shared/plan-contract/business-types.md`, copied to `docs/plan/context/business-types.md`) is the single source; if a concept has no slug, extend the registry first.
- `enum` — an `enum` `code` declared in this doc (closed, module-owned value set).
- `foreignKey` — an entity `code` in this doc → renders `identifier [ref: > target.id]` (or `ref: - ` when the relationship is 1:1).
- `externalRef` — a cross-module contract slug → renders `identifier` + a `// external_ref:{slug} | …` note (no FK constraint). Name the column by its **role** in this module (`requested_by`, `applicant_id`), never `{entity}_id`.

The pk is always `id` typed `identifier`. The renderer appends `created_at`/`updated_at` as `timestamp` — never author them. Single-tenant: no `tenant_id`.

### Output

```
docs/plan/
├── dbml.json                   ← validated source of truth (authored here)
├── dbml.dbml                   ← deterministic projection: raw DBML (ER diagram; downstream reads this)
└── context/
    ├── names.md                ← name-normalization input (from opscale-process; analysis only, not copied into dbml.json)
    └── external-refs.md        ← external-ref index (cross-checked against the field externalRefs)
```

## Steps

### Phase 0 — Load context (agent)

Spawn the context-loader agent. It returns a compact summary of any existing `docs/plan/` artifacts, `context/names.md`, and `context/system.map.md` (software/domain/module names + sibling modules for external refs). If `system.map.md` is missing, warn and recommend `/opscale-map`, but continue.

### Phase 1 — Prefix and modeling standard (authorization gate)

Confirm the **module prefix** (the subdomain slug the Generate phase prepends — e.g. `ventas`). Then decide the modeling standard: present the candidate for this domain (or "none"), explain it governs Phases 2–6 (entities, external refs, relationships, enums, attributes are reconciled against it), and record the answer in `standards.modeling`. Capture the bounded-context narrative for `standards.notes` and any reference behavior for `standards.process`.

**Wait for user approval before continuing.**

### Phase 2 — Identify entities (reconciled against the standard)

Read the `names.md` proposal (input only). Reconcile each canonical against the Phase 1 standard (or industry conventions): matches, synonyms, overloaded/ambiguous, outside-scope, or domain-native with no equivalent — **ask** on every divergence, never silently override. Filter through the DDD Scope; ask before dropping anything ambiguous. Strip any prefix stem from names. Present the final list with each entity's **kebab `code`** (= `slugify(name)`) and a one-line description. The reconciliation itself is analysis — it stays in `names.md`; only the resulting entity list is carried into `dbml.json` (there is no `terminology` block).

**Wait for user approval before continuing.**

### Phase 3 — Identify external references (virtual models)

Surface every entity this module **references but does not own** (lives in another module/package/system — `User`, `Agency`, `Country`, …). If `context/system.map.md` exists, point each at a real sibling module; otherwise ask to run `/opscale-map`. For each: a canonical name, a **contract slug** (kebab plural — becomes the `externalRef` token), and the owning `module.entity` (documentation only). Confirmed slugs govern Phase 6 (any field pointing at one uses `externalRef` + the role-based column name) and the `context/external-refs.md` index.

**Wait for user approval before continuing.**

### Phase 4 — Identify relationships

For each related pair, determine cardinality (1:1 / 1:N / N:M), whether it crosses a module boundary (external ref, no FK), and the spec source. **Every entity ends with ≥1 relationship** (the schema enforces it) — a pure catalog still declares the relationship it participates in. Record them as `relationships` entries (`belongs_to`/`has_one`/`has_many`/`many_to_many`, `target`, `field`, `description`). A `has_one` back from the target is what makes the owning side's FK render as a 1:1 `ref: - `. Ask when cardinality or ownership is ambiguous.

**Wait for user approval before continuing.**

### Phase 5 — Identify enums

Only now are enum **values** defined (`opscale-process` deliberately did not enumerate them). Surface every column with a fixed, closed value set — lifecycle statuses, type/category fields, branch decisions. Do **not** guess values: elicit the complete closed set, and **every value gets a one-line description** (the schema requires it). Record as `enums` entries with `code`, `name`, `values`.

**Wait for user approval before continuing.**

### Phase 6 — Attributes per entity (ONE ENTITY AT A TIME — hard stop-gate)

Process **one entity at a time**. For each entity present the full field set — each with its single typing key (`type` business slug / `enum` / `foreignKey` / `externalRef`), `nullable`, `default`, and `calculated: true` when the value is derived rather than captured — justify every non-standard column from the spec, and **wait for confirmation before the next entity**.

**Why one at a time:** presenting many entities at once collapses attention — the user confirms by reflex. Attribute decisions materialize one-for-one into the generated data layer, so they earn full attention, entity by entity. **Stop-gate: do not advance until the current entity's fields are confirmed.** If the user says "they all look fine, move on," push back and present them one at a time anyway.

Resolve each type in precedence: `externalRef` → `foreignKey` → `enum` → `type` (business slug). No technical-type fallback — extend the registry first if nothing matches. The pk is `id`/`identifier`; never author `created_at`/`updated_at`/`tenant_id`. Order fields pk → foreign/external refs → the rest (recommended within "the rest": descriptive, operational, status, then date/time fields). Mark any field whose value is computed (not user-entered) with `calculated: true` — it must not be a pk or a reference.

**Wait for user approval before continuing (per entity).**

### Phase 7 — Permissions per entity

For each entity, elicit the three action gates — `create`, `update`, `delete` — as predicates in the shared grammar (`true` | `false` | `field op value [and|or …]`). Referenced fields must exist on the entity; enum-value comparisons must name a real value of that field's enum (the validator checks both). Confirm per entity (reuse the per-entity rhythm of Phase 6). Permissions live in `dbml.json` only — they are consumed downstream, not rendered into `dbml.dbml`.

**Wait for user approval before continuing (per entity).**

### Phase 8 — Generate (agent)

Spawn the dbml-generator agent with the confirmed structure. It writes `docs/plan/dbml.json` and runs `render-dbml.mjs --dir=docs/plan` to project `docs/plan/dbml.dbml`. Replace existing files. Never hand-edit the `.dbml`.

### Phase 9 — Validate (agent)

Spawn the dbml-validator agent. It runs `validate-dbml.mjs --dir=docs/plan`: schema + semantic rules, then renders the DBML and parses it with `@dbml/core` (a parse throw is a FAIL), and confirms the on-disk `dbml.dbml` matches the projection. If it fails, fix the JSON and regenerate — never patch the `.dbml`. The skill does not close until it passes. `opscale-bpmn` only proceeds on PASS.

## Success condition

```bash
node scripts/validate-dbml.mjs --dir=docs/plan
```

Exit code 0 = pass (1 = fail, 2 = review warnings).
