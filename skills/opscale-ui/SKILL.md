---
name: opscale-ui
description: >
  Generates Laravel Nova Resource classes (one per DBML entity) from the graph
  manifest (graph.json) + dbml.json + bpmn.json, registers each Action on its
  Resource, and authors the Browser/flow tests. Last step of Generate, after
  opscale-logic. Trigger: "generate the Nova resources", "create the admin
  panel", "build the UI layer". Use it whenever Nova Resource/admin-panel classes
  must be generated. Not for the domain layer (opscale-domain) or Action logic
  (opscale-logic).
---

# opscale-ui

## Context

### Purpose

Generate Laravel Nova Resource classes that expose **every** domain entity in the admin panel, register each generated Action on its Resource, and author the Browser/flow tests that exercise the module through Nova. Every field, relationship, and authorization rule is derived directly from `dbml.json` (the entity list + detail) + `bpmn.json` (the Actions) within the module's `graph.json` hierarchy — nothing is invented. Read those JSON sources of truth directly; the rendered `.dbml`/`.bpmn`/`graph.html` files are projections. Output files are written to `src/Nova/` (+ `tests/Browser/`) and listed in `.specify/specs/001-mvp/plan.md` (Nova section).

This is the **last skill in the pipeline that touches the module**: the domain (`src/Models/`) and the logic (`src/Services/Actions/`) already exist. UI is where the operator-facing surface, the Action wiring, and the end-to-end flow tests all come together.

### Prerequisites — Plan phase + opscale-domain + opscale-logic must be complete

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | `opscale-process` has been run | `docs/plan/process.json` exists and PASS (`validate-process.mjs`) | Stop. Run `/opscale-process`. |
| 3 | `opscale-dbml` has been run | `docs/plan/dbml.json` exists and PASS (`validate-dbml.mjs`) | Stop. Run `/opscale-dbml`. |
| 4 | `opscale-bpmn` has been run | `docs/plan/bpmn.json` exists and PASS (`validate-bpmn.mjs`) | Stop. Run `/opscale-bpmn`. |
| 5 | The Plan graph has been generated | `docs/plan/graph.json` exists and PASS (`validate-graph.mjs`) — the module's hierarchy manifest | Stop. Generate the graph. |
| 6 | `opscale-domain` has been run | `src/Models/` contains one model per `dbml.json` entity | Stop. Run `/opscale-domain`. |
| 7 | `opscale-logic` has been run | `src/Services/Actions/` is populated (one Action per BPMN `businessRuleTask`) | Stop. Run `/opscale-logic`. |
| 8 | `tasks.md` entries for all domain + logic bundles marked complete | Check `tasks.md` for unchecked `Implement …` items | Finish pending domain/logic tasks before starting UI. |

This skill is the **last step of the Generate phase**. Order is strict: `init → domain → logic → ui`. After this skill, the module is feature-complete (Resources, Actions wired, Browser tests green) and ready for the Review phase (`debug → test → release`).

### Generator contract — scaffold, then customize

The generators in `scripts/` **minimize the code the LLM writes** — they do not finish the Resource. Each generator emits the **initial scaffold** (one Resource per DBML entity); you then **always customize**:

- **Fields** — a template cannot infer every field, its display, validation, or relation; complete them per entity.
- **Authorization, Actions, Cards, Repeatables** — add what the screen actually needs.

Rule: run the generator first, then read each generated Resource and complete it. **One Resource per DBML entity — no exceptions.**

### One Resource per entity (major change)

Every entity in `docs/plan/dbml.json` (`entities[]`, mirrored by the `entity` nodes in `graph.json`) gets its **own navigable Nova Resource** — not only the aggregate roots. A child entity is no longer buried as an inline Repeatable inside its parent with no page of its own; it has a Resource you can open, filter, and link to. **Each Resource exposes its own `has-many` / `has-one` relations as tabs** (via `Tab::group`), so navigation works from any entity, not only from the root.

Inline `Repeatable`s are **kept only for strongly-composed value collections** — child rows that are meaningless outside their parent and are always edited together in the parent's form (line items, contact methods, channels). Even then the child entity still gets its own Resource: the Repeatable is an editing convenience on the parent, the Resource is the navigable surface. See `references/repeatables.md` for the "Repeatable AND Resource" reconciliation.

Menu placement (which Resources appear in the sidebar vs. only via tabs/deep-links) is decided later by `opscale-showcase` (its menu phase); this skill generates a Resource for **every** entity regardless.

### Output file structure

```
src/
└── Nova/
    ├── {ModelName}.php             (Resource — one per DBML entity)
    └── Repeatables/
        └── {ModelName}.php          (Repeatable — only for strongly-composed value collections)
```

One Resource per DBML entity, with its business fields declared **inline** (no
shared fields trait). Repeatables are emitted only for the strongly-composed
collections described above and likewise declare their fields inline; every
entity — parent or child — still gets its own Resource.

### Resource anatomy

Every Resource follows a fixed structure: static properties → URI + labels → authorization overrides → `fieldsForIndex()` → `fields()` → optional `cards()` / `actions()` → private `statusBadge()`. For the verbatim class skeleton (with placeholder method signatures in canonical order), see `references/resource-anatomy.md` — it also documents `redirectAfterCreate()` for child entities, the `actions()` + `canSee` registration block, and the authorization-override patterns (read-only and state-locked).

### Static properties

- `$model` — always the full class-string of the Eloquent model
- `$title` — a **descriptive** business column that identifies the record in Nova UI (typically `name`, `subject`, `title`, `code`). **Never `id`** — the generator rejects it.
- `$search` — only text columns meaningful for lookup. Never include `id`.

### URI + Labels — contextual translation, MANDATORY on every Resource

`uriKey()`, `label()`, `singularLabel()` are non-optional and labels must be **contextual translations**, not literal `subdomain · entity` joins. The generator prompts the user for EN and ES per resource. Both label methods go through `__()`.

### i18n — namespaced KEYS seeded into BOTH `lang/en.json` AND `lang/es.json`

Every translatable item carries a **namespaced KEY** plus its EN and ES values.
The template emits `__(key)`; seeding writes `key → en` into `lang/en.json` and
`key → es` into `lang/es.json`. Domain strings use `{prefix}.{resource}.{slug}`
(`ventas.opportunity.title`, `ventas.opportunity.tab.quotes`,
`ventas.opportunity.status.won`); generic fixed UI strings use the global
`opscale.*` namespace (`opscale.details`, `opscale.status`, `opscale.created_at`,
`opscale.updated_at`) and are supplied by the assembler. `uriKey()` stays a raw
kebab slug — never translated. Field/resource/tab/status descriptors therefore
carry `label` = the KEY (not English) plus `label_en`/`label_es`. Every
`__()`-wrapped key must exist in both lang files immediately after generation;
existing keys are never overwritten — re-runs only fill gaps.

For the full i18n contract — the three sources of translation values, the URI+label method shape, the contextual-label rules and example — see `references/lang-seeding.md`.

### After-create redirect, authorization patterns

Non-root aggregate resources emit `redirectAfterCreate()` so the operator lands on the parent's detail URL with the new child visible in its tab. Authorization has two layers: a hard floor set per resource (`can_create` / `can_update` / `can_delete` answers emit `authorizedTo*` returning `false`) and state-conditional overrides added in the customization pass. **Both layers are seeded from the entity's `permissions` block in `docs/plan/dbml.json`** (`{ "create": <predicate>, "update": <predicate>, "delete": <predicate> }`, predicate strings over the entity's own fields): a literal `"false"` predicate → the hard floor (`authorizedTo*` returns `false`); a literal `"true"` → allowed; a field predicate such as `"status = draft"` or `"status != won and status != lost"` → a **state-conditional** `authorizedToUpdate`/`authorizedToDelete` translating the predicate against the model's status enum. These are the Phase 3 defaults the user then confirms. For verbatim code, see `references/resource-anatomy.md`.

### Relation tabs on EVERY Resource (mandatory)

Every Resource — not only the aggregate root — renders each of its `has-many` / `has-one` relations as a `Tab::make(...)` inside its own `fields()` via `Tab::group(...)`. From any entity's detail page the operator can reach the records related to it. The full pattern, including the visibility table, the `withCount` placement, and the canonical code block, lives in `references/aggregate-tabs.md`.

The related records are shown via a `HasMany`/`HasOne` field pointing at the **related entity's own Resource** (which now always exists — one per entity). This is what makes navigation work in both directions instead of only root → child.

The two rules the skill enforces every time:

1. **Visibility per tab:**
   - **Creatable from UI** (operator can add the first child via Nova) → tab always visible.
   - **System-only** (children only created by Actions / events) → tab HIDDEN while the relation has no rows. Nova 5's `Tab` has no `canSee()`, so the generator adds the tab only when `$this->resource->{relation}()->exists()` and wraps the group in `array_filter([...])`.
2. **Counts via Nova, not Eloquent.** Use `public static $with = [...]` or `indexQuery()` `withCount(...)` on the Resource — never `$withCount` on the Model. A model-level withCount runs on every query and is the canonical source of N+1 on index pages.

### Virtual (cross-subdomain) relations — Select, searchable, filterable

Logical refs across subdomains (no foreign-key constraint, resolved through a `*Contract` per `opscale-domain`) are NOT rendered as `Text::make(...)->help('Logical reference…')`. They are rendered as a real `Select::make(...)->options(fn () => app({Repo}::class)->forSelect())->searchable()->filterable()->displayUsingLabels()`. The foreign repository contract must expose `forSelect(): array` returning `[id => label]`. See `references/virtual-relations.md` for the full Select pattern and contract extension.

### Fields — two methods only (`fields()` + `fieldsForIndex()`)

Every Resource defines exactly two field methods. There is **no** `fieldsForCreate()`, **no** `coreFields()`, and **no** shared `{ModelName}Fields` trait — business fields are declared **inline** in `fields()`.

- **`fields()`** — the full set (detail + create + update): all business fields inline, plus the status `Badge` and `created_at`/`updated_at`. View differences are handled **per field** with hide/show modifiers (`->onlyOnForms()`, `->hideWhenCreating()`, `->hideWhenUpdating()`, `->exceptOnForms()`, `->hideFromIndex()`, `->onlyOnDetail()`) — never by splitting into another method.
- **`fieldsForIndex()`** — a curated, **N+1-free** subset: only the most-relevant, cheap-to-render columns (title/identifier + status badge + usually `created_at`), each `->sortable()`. **Never** a relationship field (`BelongsTo`/`HasMany`/`HasOne`/`MorphTo`/virtual `Select`) — those resolve per row and cause N+1 on the index.

The generator emits both methods and a private `statusBadge(): Badge` helper (when the entity has a status enum) called from each. Layout rule for `fields()`: if the model has any `HasOne`/`HasMany`, wrap fields in `Tab::group()` with `Tab::make(__('Details'), [...])` for own fields plus one tab per relationship — see `references/aggregate-tabs.md`. Flat `fields()` is only allowed when the model has zero HasOne/HasMany. Never expose `id` as a Nova field.

For the full per-column-type field selection table, standard modifiers, the canonical `created_at`/`updated_at` and `Badge` status patterns, the color convention, and the `fields()`/`fieldsForIndex()` curation rules, see `references/fields-catalog.md`.

### Register Actions on Resources (moved here from opscale-logic)

`opscale-logic` already generated the Action classes under `src/Services/Actions/`. **Wiring each Action onto the Resource that operates on it is now this skill's job** (it used to live in `opscale-logic` Phase 4). For every Action, add it to the `actions()` method of the Resource for the entity it operates on, wrapped in the `canSee` guard that matches the Action's SIPOC state/role precondition:

```php
public function actions(NovaRequest $request): array
{
    return [
        ApproveApplication::make()
            ->canSee(fn ($request) => $request->findModel()?->status?->is(ApplicationStatus::PendingReview)),
    ];
}
```

- Single permitted state → `->status?->is(...)`; multiple → `in_array($request->findModel()?->status, [...], strict: true)`; role → `$request->user()?->can('...')`; no precondition → register without `canSee`.
- The entity an Action operates on comes from the Action's `sipoc.json` object (the `inputs[]` record with `source:"System"` + `type:"identifier"` — the passed record — or the BPMN logic operation's primary `operations[]` `crud` entity) and the Action's `parameters()`.
- `canSee` is a UI affordance, not security — the Action's `handle()`/`canRun()` remains the authoritative guard.

The full pattern catalogue is copied from logic into `references/canSee-patterns.md`. This registration happens in its own phase (see Steps → "Register Actions on Resources").

### Cards, Repeatables

- **Cards (Metrics)** — only add a `cards()` method when metrics are defined. Always use `->onlyOnDetail()` unless the metric belongs on the index. Metric classes live in `src/Nova/Metrics/`.
- **Repeatables** — for strongly-composed value collections edited inline in the parent form, use Nova Repeatables. The child still gets its own Resource, and the Repeatable declares its fields **inline** (no shared trait). Full pattern + reconciliation in `references/repeatables.md`.

### Code templates

The authoritative templates live on disk:

- `templates/resource.php.tmpl` — Nova Resource (fields inline, `fields()` + `fieldsForIndex()`)
- `templates/repeatable.php.tmpl` — Nova Repeatable (fields inline)

The JSON contract for each is documented at the top of the matching `scripts/generate-*.mjs` file. The skill never hand-writes Resource PHP — normalize the inputs into the JSON contract and let the script render the `.tmpl`.

### Domain Rules

1. **One entity = one bundle task in `tasks.md`** — Resource (+ Repeatable only for strongly-composed collections) ships as a single tracked task. Each Nova bundle task `depends_on` its corresponding `opscale-domain` bundle task.
2. **One Resource per DBML entity** — every entity in `docs/plan/dbml.json` (`entities[]`) gets its own navigable Resource, parent or child. Each Resource renders its own has-many/has-one relations as tabs. Repeatables are an inline-editing convenience on the parent, never a replacement for the child's Resource.
3. **No business logic** — Nova Resources are pure UI. No calculations, no service calls, no Eloquent queries inline.
4. **All strings translatable — zero exceptions** — every user-visible string must be wrapped in `__()`. Only technical identifiers stay untranslated.
5. **Never expose `id` as a Nova field, and `$title` is never `id`** — no `ID::make()`, no `Text::make('ID', 'id')`; `$title` is a descriptive business column (the generator rejects `title_column: "id"`). Human-meaningful business identifiers live in their own column.
6. **Foreign keys must use relationship fields** — any column ending in `_id` or marked as `ref:` in the DBML must be exposed via `BelongsTo::make()` (or `MorphTo::make()` for polymorphic). Always add `->searchable()`.
7. **Tabs MANDATORY for HasOne/HasMany on every Resource** — wrap fields in `Tab::group()` with `Tab::make(__('Details'), [...])` for own fields plus one `Tab::make` per relationship. Applies to every entity's Resource, not just aggregate roots.
8. **Badge for status** — status columns always use `Badge`. Color convention: success/warning/danger/info.
9. **DateTime always diffForHumans** — `->displayUsing(fn ($v) => $v?->diffForHumans())->exceptOnForms()`.
10. **Authorization confirmed per resource** — for every aggregate the skill must ask `can create? / can update? / can delete?` and pass answers to `generate-resource.mjs`.
11. **Two field methods — `fields()` + `fieldsForIndex()`** — every Resource defines both. `fields()` is the full set (detail + create + update) with per-field hide/show for view differences; `fieldsForIndex()` is a curated, N+1-free subset (most-relevant scalar columns + status badge, `->sortable()`), **never** a relationship field. No `fieldsForCreate()`, no `coreFields()`.
12. **Every Action is registered on exactly one Resource** — each Action in `src/Services/Actions/` is added to the `actions()` of the Resource for the entity it operates on, wrapped in the `canSee` guard matching its SIPOC precondition (`references/canSee-patterns.md`). No Action is left unwired; no Action is registered on two Resources.
13. **`@extends Resource<Model>`** — always add the generic docblock for IDE type inference.
14. **Every entity = Resource (+ Repeatable when strongly composed)** — the Repeatable ships only for value collections edited inline in a parent.
15. **No shared field traits** — business fields are declared **inline** in the Resource's `fields()` and, for Repeatables, inline in the Repeatable's `fields()`. There is no `Nova/Concerns/{ModelName}Fields.php` and no `coreFields()`.
16. **Rules via `Model::$validationRules`** — never duplicate rules inline. Use spread: `->rules(...Model::$validationRules['col'])`.
17. **`uriKey()`, `label()`, `singularLabel()` MANDATORY — labels are CONTEXTUAL translations.** `uri_key`, `label`, `singular_label`, `label_es`, `singular_label_es` are required JSON inputs.
18. **Lang seeded for BOTH `en` and `es` automatically, by namespaced KEY** — every translatable carries a namespaced key (`{prefix}.{resource}.{slug}` for domain strings, `opscale.*` for fixed UI) plus `label_en`/`label_es`. `generate-resource.mjs` and `generate-repeatable.mjs` write `key → en` into `lang/en.json` and `key → es` into `lang/es.json` in a single run. Existing keys are never overwritten. EN-only seeding is forbidden; `uriKey()` is never translated.
19. **Every Resource renders its own relations as tabs.** Tab visibility follows the creatable-from-UI rule. Counts are loaded via Nova `$with` / `indexQuery()` withCount on the **Resource**, never on the Eloquent model.
20. **Child-entity Resources must emit `redirectAfterCreate()`.** The generator emits this method automatically when the JSON contract carries `child_of: { parent_uri, foreign_key }`, landing the operator on the parent's detail page.
21. **Cross-subdomain logical refs render as Select, never Text** — `Select::make(...)->options(fn () => app({Repo}::class)->forSelect())->searchable()->filterable()->displayUsingLabels()`. Text + `->help('Logical reference…')` is no longer accepted. **Drivability caveat:** `->searchable()` renders a custom typeahead a Dusk `select()` cannot set. Any column a Browser flow test must set on the **create form** must be a **native `Select`** (no `->searchable()` on that field) — or the flow seeds the record and selects a seeded option (see Rule 23).
22. **Browser/flow tests EXECUTE the subprocess** — one `tests/Browser/{Flow}FlowTest.php` per subprocess of `docs/plan/process.json` (`subprocesses[]`). Each drives the real flow (create via form → run each Action from the detail toolbar) and asserts **both** the user-visible transition (`->refresh()->waitForAnywhere('<new state>')`, plus no error toast after every submit) **and** the persisted DB post-condition (`->fresh()->status`, counts — reads the shared workbench SQLite). Generated by the `web-test-generator` agent.
23. **Flow-test drivability gotchas (confirmed).** (a) Only native Nova `Select`/Text inputs are Dusk-drivable; `->searchable()` and `BelongsTo` render custom components `select()` can't set, and two `BelongsTo` to the same resource share a `dusk` id (ambiguous) → use a `Select` per column for anything the test drives. (b) Standalone actions on the **index** toolbar are not drivable (`NovaActionDecorator` doesn't propagate `$standalone`) → register every driven Action on the **detail** toolbar. (c) Fake external-ref IDs typed into forms must be valid ULIDs (Crockford — no `i/l/o/u`) or the `ulid` rule rejects them. Details in `references/flow-test-gotchas.md`.

## Steps

### Phase 1 — Inventory every entity (data model first)

Read `docs/plan/dbml.json` as the definitive per-entity list: `entities[]`, each with its `fields[]`, `relationships[]`, and `permissions`. Read `docs/plan/graph.json` as the module's **hierarchy manifest** — a nested `module` → `subprocesses[]` → `steps[]` → `operations[]` tree of `{id, ref}` nodes (no entity/enum nodes; those live in `dbml.json`) — to see the process/step structure and which Actions (first-level `logic` operations) exist. Read `docs/plan/bpmn.json` `operations[]` for the Actions (first-level `logic`) and which entity each one writes (via its `composed[]` CRUDs — each a `crud` with its `entity`+`action`).

Build the inventory with **one Resource per entity** — every `entities[]` entry in `dbml.json`, not only aggregate roots. Cross-reference `src/Models/` to confirm each entity has a model. For each entity note its has-many/has-one relations (from `relationships[]` → tabs) and which BPMN Actions target it (from `bpmn.json` logic ops' `composed[]` CRUDs → `actions()` registration in a later phase):

```
Nova UI inventory for [Module Name]:

Entities ([N] — one Resource each):
  1. [EntityA]  →  Resource          relations: [rel→tab, …]   actions: [ActionX, …]
  2. [EntityB]  →  Resource (+ Repeatable, strongly composed in [EntityA])
  ...

Flows (from process.json subprocesses[] — one Browser test each):
  SP-01 [Flow name]
  SP-02 [Flow name]
  ...
```

**Wait for user approval before continuing.**

### Phase 2 — Propose Resource layout via spec-kit

Like `opscale-domain`, the UI layer formalizes its plan through spec-kit so each entity becomes a tracked task inside the MVP feature (`.specify/specs/001-mvp/`). The atomic unit is **the Nova bundle per entity**: Resource (+ Repeatable when the entity is a strongly-composed value collection). Two extra task kinds cover the new responsibilities: **Action registration** and **Browser flow tests**.

**2a. Run `/speckit.plan`** with the entity + flow list:

```
/speckit.plan "Nova UI layer for {module-name}: [N] entities from docs/plan/dbml.json.
Generate one task per entity, each covering its full Nova bundle:
  - 1 Resource at src/Nova/{ModelName}.php (fields inline, fields() + fieldsForIndex())
  - 1 Repeatable at src/Nova/Repeatables/{ModelName}.php (only for strongly-composed value collections)

Plus:
  - 1 task 'Register Actions on Resources' — wire every src/Services/Actions/ Action onto its Resource's actions() with canSee.
  - 1 task per subprocess in docs/plan/process.json — a Browser flow test at tests/Browser/{Flow}FlowTest.php.
  - 1 task per Nova Menu / Dashboard / shared Filter (only if defined in spec)."
```

Confirm `plan.md` with the user.

**2b. Run `/speckit.tasks`** with the bundle contract:

| Task field | Value |
|------------|-------|
| Title | `Implement {EntityName} Nova bundle` |
| Description | "Expose {EntityName} in the Nova admin panel" |
| Outputs | `src/Nova/{Name}.php` (+ `src/Nova/Repeatables/{Name}.php` when applicable) |
| Acceptance | Resource registered, `fields()` + `fieldsForIndex()` present, `$title` not `id`, no `ID` field exposed, FKs use BelongsTo/MorphTo, all labels via `__()`, Tabs used if model has HasOne/HasMany |
| Depends on | The domain task for the same entity (must be complete) |

Plus the two cross-cutting tasks:

| Task | Outputs | Acceptance |
|------|---------|------------|
| `Register Actions on Resources` | edited `src/Nova/*.php` `actions()` blocks | Every Action in `src/Services/Actions/` registered on exactly one Resource with the correct `canSee` guard |
| `Browser flow test — {Subprocess}` | `tests/Browser/{Flow}FlowTest.php` | One `#[Test]` per path; every `submitForm()` paired with `assertNoErrorToast()`; user-visible asserts only |

**Verify `tasks.md`:**

```
[ ] One bundle task per entity — count matches dbml.json entities[] count
[ ] Each task lists Resource (+ Repeatable when applicable) in Outputs
[ ] One 'Register Actions on Resources' task
[ ] One 'Browser flow test' task per process.json subprocess
[ ] Each task depends_on its domain bundle counterpart
[ ] Resource/Repeatable never split across tasks
```

If any check fails, regenerate `tasks.md` before continuing.

**Wait for user approval before continuing.**

### Phase 3 — Per-resource authorization confirmation

For each entity in the inventory, **pre-fill the CRUD defaults from the entity's `permissions` block in `docs/plan/dbml.json`**, then **ask the user to confirm** which operations the Resource should expose in Nova. Map each `permissions` predicate to a default answer: `"false"` → `n`, `"true"` → `Y`, a field predicate (e.g. `"status = draft"`) → `Y` **plus a state-conditional guard** carrying the predicate. Present the default alongside the prompt rather than asking blind:

```
For each aggregate, confirm Nova CRUD access (default from dbml.json permissions):

  [ModelA]   permissions: { create: true, update: "status != won and status != lost", delete: false }
    can create? (Y/n)   [default Y]
    can update? (Y/n)   [default Y — state-locked: status != won and status != lost]
    can delete? (Y/n)   [default n]

  [ModelB]
    can create? (Y/n)
    can update? (Y/n)
    can delete? (Y/n)
  ...
```

The answers map directly to the JSON contract of `generate-resource.mjs`: `can_create`, `can_update`, `can_delete`. When any flag is `false` (a `"false"` predicate or an operator `n`), the generated Resource emits the corresponding `authorizedTo*` method returning `false`. When all three are `true` with no field predicate, no overrides are emitted. A field predicate becomes the state-conditional `authorizedToUpdate`/`authorizedToDelete` added in the customization pass.

Read-only / system-generated resources (all-`false` permissions) answer `n / n / n`. State-locked resources (field predicate) answer `Y` here and get the predicate's guard compiled in Phase 4.

The confirmed answers are the input to the Phase 4 `resource-authorization-generator`, which compiles each predicate into the `authorize: { create, update, delete }` contribution with the shared `compilePredicate` helper (`false` → deny, `true` → omit the override, a field predicate → `{ expr }`). No predicate is hand-translated into PHP.

Do not proceed to generation until every entity has all three answers recorded.

**Wait for user approval before continuing.**

### Phase 3b — Per-resource contextual labels (EN + ES)

For each entity, ask the user for the **contextual** plural and singular label in both English and Spanish. Do NOT auto-derive from the entity name — only the operator/owner knows whether `application` in `credits` should read "Credit application" vs "Loan application". Reject empty answers, reject literal `subdomain · entity` concatenations, reject the bare entity name when more than one subdomain is in play. Enum option labels and any custom Tab labels get the same EN/ES treatment.

These contextual values are the input to the Phase 4 `resource-labels-generator`, which pairs them with the namespaced KEYS (`{prefix}.{resource}.{slug}`) the fields/tabs/actions agents minted and returns the EN/ES values the assembler seeds. For the verbatim prompt template, the JSON contract mapping, and the EN/ES seeding rules, see `references/lang-seeding.md`.

**Wait for user approval before continuing.**

### Phase 4 — Generate Nova bundles (fleet of section agents → assembler)

Generation is **always deterministic**. A Nova Resource is no longer built by one
monolithic generator: it is assembled from the structured contributions of a
**fleet of single-concern section agents**, each reading only its narrow
`dbml.json` / `bpmn.json` slice and returning a JSON fragment. The deterministic
`scripts/generate-resource.mjs` assembler merges the fragments and renders the
class. The LLM supplies only the contextual EN/ES label values (via
`resource-labels-generator`) and subjective display tweaks.

**Per entity, derive the shared inputs once** (`MODULE_PREFIX` from the
constitution, the business-types binding, the entity's `dbml.json` slice and the
module's `bpmn.json`/`graph.json`), then **fan out the six section agents IN
PARALLEL**:

| Agent | Concern | Reads | Emits |
|-------|---------|-------|-------|
| `resource-fields-generator` | ordered `fields[]` + badge inputs | entity fields + enums + business-types binding | `fields[]`, `has_status`, `status_enum`, `status_badge` |
| `resource-authorization-generator` | CRUD authorization | entity `permissions` | `authorize: { create, update, delete }` (via `compilePredicate`) |
| `resource-index-generator` | the index view | entity fields | `title_column`, `search_columns`, `on_index` flags (long-text `raw` Str::limit cap) |
| `resource-labels-generator` | contextual i18n (interactive) | entity + enums + the minted keys | resource/field/tab/status KEYS + EN/ES values, `uri_key` |
| `resource-tabs-generator` | relation tabs | entity `relationships[]` + child `permissions.create` | `has_many_relationships`, `has_one_relationships` (`creatable_from_ui`) |
| `resource-actions-generator` | Action wiring | `bpmn.json`/`graph.json` logic ops + entity enum | `actions[]` with `can_see_expr` |

**Merge** the six contributions into one `generate-resource.mjs` input (fold the
labels-generator's EN/ES onto the matching field/tab/status descriptors as
`label_en`/`label_es`), **run the assembler**, then gate. A Repeatable is emitted
in parallel only for strongly-composed value collections (same inline-fields +
i18n-key scheme via `generate-repeatable.mjs`). Entity bundles run fully in
parallel — no cross-entity dependencies.

**The deterministic rules each agent applies** (do NOT re-derive per entity — the
agents own them): field selection from the business type / `foreignKey` /
`externalRef` / `enum`; `calculated → exceptOnForms`; FK `→ BelongsTo + searchable`;
`externalRef → VirtualSelect` (filterable + displayUsingLabels, never searchable —
drivable); long-text `→ hideFromIndex`; filterable on date/money/number/boolean;
field order pk→fk/ext→rest→date; status enum → `Badge` (filterable, sortable);
`title_column`/`$search` are descriptive columns, never `id`; tabs count-gated
unless the child is creatable; `child_of` on child entities → `redirectAfterCreate()`.
See `references/fields-catalog.md`, `references/aggregate-tabs.md`,
`references/resource-anatomy.md`.

**Foundation the assembler now provides** (shared, copied by the logic/domain
builds): `compilePredicate(pred, enumCaseResolver)` in `scripts/_lib.mjs`
(predicate grammar → PHP boolean over `$this`, resolving enum values to
`{EnumClass}::{Case}`); the `raw` modifier passthrough
(`{ "raw": "displayUsing(fn ($v) => Str::limit((string) $v, 40))" }`, with `Str`
auto-imported); the namespaced i18n-key seeding (`__(key)`; `key → en` into
`en.json`, `key → es` into `es.json`); the `authorize` block; and the `actions`
block. The JSON contract lives in the header of `scripts/generate-resource.mjs`.
The skill never hand-writes Resource PHP — normalize into the JSON contract and
let the assembler render the template.

**Business types drive field selection.** Before picking a field heuristically, check the field's `dbml.json` **`type`**: the business-type slug IS the declared field type (`{ "code": "contact_email", "type": "email" }`), and the Nova field, its `config`, and its `->help()` hint come from the Laravel/Nova **binding** (`.specify/memory/business-types.php`; canonical slugs in `docs/plan/context/business-types.md`) — an `email` field renders `Email::make`, a `money` field renders `Currency::make` with its currency config, never a bare `Text::make`. Heuristics apply only to `enum`-typed fields (field carries `enum:"<code>"` → the Enum's select) and to `fk` fields (`foreignKey` → `BelongsTo`, `externalRef` → virtual `Select`). **Why:** the registry is what guarantees the same business type looks and validates identically across every module.

**Catalog-backed options.** A slug whose binding is a `Select` over a configurable list (`options`, `city`, …) has no enum to read its cases from: pass the field as `{ "field": "Select", "options_expr": "<PHP expression>" }` (e.g. `Catalog::options('bank')` over the module's `config/{module}.php` catalogs). A `Select` needs either `enum_class` or `options_expr`. Enum Selects label each option with the enum's `label()` (translated), never the PHP case name.

**Status badge labels are per Resource.** A badge label without an explicit `label` key gets `{prefix}.{resource}.status.{case}` (derived from the resource `label` key), so two Resources that share an English status keep their own Spanish wording and gender ("Aprobada" for a run, "Aprobado" for a voucher).

**The package provider registers every Resource.** After generating, list each `src/Nova/*.php` class in the module's `SubdomainServiceProvider::configurePackage()` → `->hasResources(Nova\Profile::class, …)`. A bare `->hasResources()` registers nothing: the workbench still works (its `NovaServiceProvider` lists the Resources by hand), but a host app that installs the module serves none of them. Pin it with a Unit test that compares `$package->resources` against the files in `src/Nova`.

**Actions register through `{Action}::make()`** (instantiating with `new` breaks the strict-rules dependency-inversion check). A `canSee` expression that references `ActionRequest` gets its import automatically.

**Three invariants the JSON normalization must enforce** (the scripts assume they hold):

- Every label the user sees is provided in human form — the script wraps every label, `Tab::make`, `Badge::labels` entry, `Select::options` value label, and `->help()` text in `__()` automatically.
- Foreign keys with real Eloquent relationships are `BelongsTo` field entries in the `fields` array. Logical cross-subdomain refs are `VirtualSelect` field entries (rendered as `Select::make(...)` with a contract resolver — see `references/virtual-relations.md`).
- Resources with HasMany/HasOne **must** have `has_many_relationships` / `has_one_relationships` populated — the script applies `Tab::group(...)` automatically when either list is non-empty.

After generation, append the Nova layer table to `.specify/specs/001-mvp/plan.md` with the `Task ID` column tying each file back to its `tasks.md` entry.

**Wait for user approval before continuing.**

### Phase 5 — Register Actions on Resources

`opscale-logic` already produced the Action classes in `src/Services/Actions/`. Wire each one onto the Resource for the entity it operates on — this responsibility **moved here from `opscale-logic` Phase 4**.

For each Action:

1. **Find its target Resource.** Read the Action's `sipoc.json` object (`sipocs[]` where `id` == the Action identifier) — the `inputs[]` record with `source:"System"` + `type:"identifier"` (the passed record), or the BPMN logic operation's primary `operations[]` `crud` entity, names the entity — and its `parameters()` primary model. That entity's Resource is where the Action registers.
2. **Determine the `canSee` guard** from the SIPOC's `businessRules[]` / `process[]` preconditions and the entity's `dbml.json` `permissions.update` predicate, using `references/canSee-patterns.md`:
   - single state → `->canSee(fn ($request) => $request->findModel()?->status?->is({Enum}::{State}))`
   - multiple states → `in_array($request->findModel()?->status, [...], strict: true)`
   - role → `$request->user()?->can('{permission}')`
   - state + role → both, joined with `&&`
   - no precondition → register without `canSee`
3. **Add the Action** to that Resource's `actions()` method via `{Action}::make()->canSee(...)`.

Every Action lands in exactly **one** Resource's `actions()`; no Action is left unwired. `canSee` is a UI affordance only — the Action body remains the authoritative guard. Append the wiring to `.specify/specs/001-mvp/plan.md` (Action → Resource → canSee shape).

**Wait for user approval before continuing.**

### Phase 6 — Generate Browser/flow tests

Author the end-to-end Browser tests that drive the module through Nova — this responsibility **moved here from `opscale-test`**. **One flow = one subprocess** of `docs/plan/process.json` (`subprocesses[]`).

For each `subprocesses[]` entry in `process.json`, spawn the `web-test-generator` agent with:

- `flow_name` / `flow_id` — from the subprocess `name` / `code` (`SP-XX`)
- `steps` — the subprocess's ordered `steps[]`, mapped to Nova interactions; read `docs/plan/bpmn.json` `operations[]` (match on `step`) for the operations under each step (`crud` → form submit; `logic` → Action modal)
- `resources_involved` — the Resources (URI keys) the flow touches
- `actions_triggered` — the Action identifiers invoked in the flow
- `package_namespace`, `output_dir: tests/Browser/`

The agent writes `tests/Browser/{Flow}FlowTest.php` — one `#[Test]` per path (happy + each gateway branch + each UI-visible failure). Each method **executes** the subprocess, it does not merely visit it: create the `crud:create` entities through the real Nova form (`/resources/{uri}/new` → fill native Selects/Text → `@create-button`), then run each Action from the **detail toolbar** via the `runAction($browser, '{id}', [...])` helper (`[data-action-id="{id}"]` → fill `form [dusk="{col}"]` with `select`/`type`, dates in `mdY` → `@confirm-action-button`). Assert **both** layers: the visible transition (`->refresh()->waitForAnywhere('<new state>')`, and `assertNoErrorToast()` after every submit — `runAction()` does this) **and** the persisted DB post-condition (`->fresh()->status`, row counts). A test that only does `visit` + `waitForText` + `assertSee('<a button>')` has not exercised the flow and fails the gate. Login via `$this->loginToNova($browser)`; `openAction`/`runAction`/`waitForAnywhere` come from the `opscale-init` Dusk harness.

**Seed data:** flows start from real pages, so records must exist. Reuse the domain factories/seeder — either drive the create path through the Nova form itself, or seed via `workbench/database/seeders/DatabaseSeeder` before the flow. Respect the drivability gotchas (Rule 23, `references/flow-test-gotchas.md`): drive only native Selects, run Actions from the detail toolbar, and type only valid-ULID fake ids.

Add one `Browser flow test — {Subprocess}` task per subprocess to `.specify/specs/001-mvp/tasks.md`.

**Wait for user approval before continuing.**

### Phase 7 — Gate — linters + Browser tests green

The module is feature-complete only when the UI compiles, boots, and the flows pass end-to-end. Run, in order:

1. **Resource smoke checks** — `php -l` on every file, reflection-load every Resource class, `testbench workbench:build` boots with Nova mounted. Verbatim commands in `references/smoke-gate.md`.
2. **Flow-test coverage — HARD, blocking.** One flow test per subprocess, and each must EXECUTE (not visualize) the flow. Run verbatim:

   ```bash
   set -e
   # A flow test file per subprocess in process.json (one per subprocesses[] entry).
   # Subprocess codes are "SP-NN" (steps are "SP-NN-NN"); the closing quote after two digits
   # matches only subprocess codes.
   count=$(grep -Eo '"code"[[:space:]]*:[[:space:]]*"SP-[0-9]{2}"' docs/plan/process.json | wc -l | tr -d ' ')
   files=$(ls tests/Browser/*FlowTest.php 2>/dev/null | wc -l | tr -d ' ')
   [ "$files" -ge "$count" ] || { echo "Flow tests ($files) < subprocesses ($count)"; exit 1; }
   # Each flow test executes the subprocess and asserts the effect (UI + DB).
   for t in tests/Browser/*FlowTest.php; do
     grep -q 'data-action-id\|runAction('     "$t" || { echo "$t: does not run any Action from the detail toolbar"; exit 1; }
     grep -q 'waitForAnywhere('               "$t" || { echo "$t: no post-Action transition assertion"; exit 1; }
     grep -q -- '->fresh()'                   "$t" || { echo "$t: no DB post-condition assertion"; exit 1; }
   done
   echo "Flow-test coverage gate OK"
   ```
3. **Linters** — `composer run lint` (Pint / PHPStan per `opscale-init`) clean.
4. **Browser tests** — `composer run test:browser` green (chains `build`, runs the Dusk suite headless against the Nova DevTool workbench).

Any failure means the skill is NOT done. Do NOT mark the gate `PASS` on file count — reflection-load and a green Browser run are what catch the bugs behind syntactically valid PHP. On Browser failure, inspect `tests/Browser/screenshots/` + `tests/Browser/console/` and fix selectors / waits / seed data / Resource code, then re-run. Mark the matching `001-mvp` tasks complete only after this gate passes.

**Wait for user approval before continuing.**

## Sample

Nova Resource excerpt with `Tab::group` + `redirectAfterCreate` + `Select` virtual relation + `actions()` with `canSee`, plus a Browser flow test excerpt — see `references/sample-output.md`.

## Success condition

```bash
vendor/bin/testbench workbench:build \
  && vendor/bin/testbench tinker --execute="reflectAllResources()" \
  && composer run test:browser
```

Exit code 0 = pass.
