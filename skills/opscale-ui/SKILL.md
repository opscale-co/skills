---
name: opscale-ui
description: >
  Generates Laravel Nova Resource classes (one per DBML entity) from the
  ontology manifest + DBML + BPMN, registers each Action on its Resource, and
  authors the Browser/flow tests. Last step of Generate, after opscale-logic.
  Trigger: "generate the Nova resources", "create the admin panel", "build the
  UI layer".
  Use it whenever Nova Resource/admin-panel classes must be generated, even if just "build the admin". Not for the domain layer (opscale-domain) or Action logic (opscale-logic).
---

# opscale-ui

## Context

### Purpose

Generate Laravel Nova Resource classes that expose **every** domain entity in the admin panel, register each generated Action on its Resource, and author the Browser/flow tests that exercise the module through Nova. Every field, relationship, and authorization rule is derived directly from the ontology manifest + DBML + BPMN — nothing is invented. Output files are written to `src/Nova/` (+ `tests/Browser/`) and listed in `.specify/specs/001-mvp/plan.md` (Nova section).

This is the **last skill in the pipeline that touches the module**: the domain (`src/Models/`) and the logic (`src/Services/Actions/`) already exist. UI is where the operator-facing surface, the Action wiring, and the end-to-end flow tests all come together.

### Prerequisites — Plan phase + opscale-domain + opscale-logic must be complete

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | `opscale-process` has been run | `docs/plan/process.txt` exists and PASS | Stop. Run `/opscale-process`. |
| 3 | `opscale-dbml` has been run | `docs/plan/dbml.dbml` + `docs/plan/dbml.txt` exist and PASS | Stop. Run `/opscale-dbml`. |
| 4 | `opscale-bpmn` has been run | `docs/plan/bpmn.bpmn` + `docs/plan/bpmn.txt` exist and PASS | Stop. Run `/opscale-bpmn`. |
| 5 | `opscale-ontology` has been run | `docs/plan/ontology.mmd` + `docs/plan/ontology.txt` exist (the Plan manifest) | Stop. Run `/opscale-ontology`. |
| 6 | `opscale-domain` has been run | `src/Models/` contains one model per DBML entity | Stop. Run `/opscale-domain`. |
| 7 | `opscale-logic` has been run | `src/Services/Actions/` is populated (one Action per BPMN `businessRuleTask`) | Stop. Run `/opscale-logic`. |
| 8 | `tasks.md` entries for all domain + logic bundles marked complete | Check `tasks.md` for unchecked `Implement …` items | Finish pending domain/logic tasks before starting UI. |

This skill is the **last step of the Generate phase**. Order is strict: `init → domain → logic → ui`. After this skill, the module is feature-complete (Resources, Actions wired, Browser tests green) and ready for the Review phase (`debug → test → release`).

### Generator contract — scaffold, then customize

The generators in `scripts/` **minimize the code the LLM writes** — they do not finish the Resource. Each generator emits the **initial scaffold** (one Resource per DBML entity); you then **always customize**:

- **Fields** — a template cannot infer every field, its display, validation, or relation; complete them per entity.
- **Authorization, Actions, Cards, Repeatables** — add what the screen actually needs.

Rule: run the generator first, then read each generated Resource and complete it. **One Resource per DBML entity — no exceptions.**

### One Resource per entity (major change)

Every table listed in `docs/plan/dbml.txt` gets its **own navigable Nova Resource** — not only the aggregate roots. A child entity is no longer buried as an inline Repeatable inside its parent with no page of its own; it has a Resource you can open, filter, and link to. **Each Resource exposes its own `has-many` / `has-one` relations as tabs** (via `Tab::group`), so navigation works from any entity, not only from the root.

Inline `Repeatable`s are **kept only for strongly-composed value collections** — child rows that are meaningless outside their parent and are always edited together in the parent's form (line items, contact methods, channels). Even then the child entity still gets its own Resource: the Repeatable is an editing convenience on the parent, the Resource is the navigable surface. See `references/repeatables.md` for the "Repeatable AND Resource" reconciliation.

Menu placement (which Resources appear in the sidebar vs. only via tabs/deep-links) is decided later by `opscale-showcase` (its menu phase); this skill generates a Resource for **every** entity regardless.

### Output file structure

```
src/
└── Nova/
    ├── {ModelName}.php             (Resource — one per DBML entity)
    ├── Concerns/
    │   └── {ModelName}Fields.php    (shared fields trait)
    └── Repeatables/
        └── {ModelName}.php          (Repeatable — only for strongly-composed value collections)
```

One Resource per DBML entity. Repeatables are emitted only for the strongly-composed collections described above; every entity — parent or child — still gets its own Resource.

### Resource anatomy

Every Resource follows a fixed structure: static properties → URI + labels → authorization overrides → `fields()` → optional `fieldsForCreate()` / `cards()` / `actions()`. For the verbatim class skeleton (with placeholder method signatures in canonical order), see `references/resource-anatomy.md` — it also documents `redirectAfterCreate()` for child entities, the `actions()` + `canSee` registration block, and the authorization-override patterns (read-only and state-locked).

### Static properties

- `$model` — always the full class-string of the Eloquent model
- `$title` — the column that identifies the record in Nova UI (typically `name`, `subject`, `title`, or `id`)
- `$search` — only text columns meaningful for lookup. Never include `id`.

### URI + Labels — contextual translation, MANDATORY on every Resource

`uriKey()`, `label()`, `singularLabel()` are non-optional and labels must be **contextual translations**, not literal `subdomain · entity` joins. The generator prompts the user for EN and ES per resource. Both label methods go through `__()`.

### i18n — seed BOTH `lang/en.json` AND `lang/es.json`

Every `__()`-wrapped string must have keys in both `lang/en.json` and `lang/es.json` immediately after generation. EN-only seeding shifts work to the user post-generation and gets silently dropped. Existing keys are never overwritten — re-runs only fill gaps.

For the full i18n contract — the three sources of translation values, the URI+label method shape, the contextual-label rules and example — see `references/lang-seeding.md`.

### After-create redirect, authorization patterns

Non-root aggregate resources emit `redirectAfterCreate()` so the operator lands on the parent's detail URL with the new child visible in its tab. Authorization has two layers: a hard floor set per resource (`can_create` / `can_update` / `can_delete` answers emit `authorizedTo*` returning `false`) and state-conditional overrides added in the customization pass. For verbatim code, see `references/resource-anatomy.md`.

### Relation tabs on EVERY Resource (mandatory)

Every Resource — not only the aggregate root — renders each of its `has-many` / `has-one` relations as a `Tab::make(...)` inside its own `fields()` via `Tab::group(...)`. From any entity's detail page the operator can reach the records related to it. The full pattern, including the visibility table, the `withCount` placement, and the canonical code block, lives in `references/aggregate-tabs.md`.

The related records are shown via a `HasMany`/`HasOne` field pointing at the **related entity's own Resource** (which now always exists — one per entity). This is what makes navigation work in both directions instead of only root → child.

The two rules the skill enforces every time:

1. **Visibility per tab:**
   - **Creatable from UI** (operator can add the first child via Nova) → tab always visible.
   - **System-only** (children only created by Actions / events) → tab HIDDEN when count = 0.
2. **Counts via Nova, not Eloquent.** Use `public static $with = [...]` or `indexQuery()` `withCount(...)` on the Resource — never `$withCount` on the Model. A model-level withCount runs on every query and is the canonical source of N+1 on index pages.

### Virtual (cross-subdomain) relations — Select, searchable, filterable

Logical refs across subdomains (no foreign-key constraint, resolved through a `*Contract` per `opscale-domain`) are NOT rendered as `Text::make(...)->help('Logical reference…')`. They are rendered as a real `Select::make(...)->options(fn () => app({Repo}::class)->forSelect())->searchable()->filterable()->displayUsingLabels()`. The foreign repository contract must expose `forSelect(): array` returning `[id => label]`. See `references/virtual-relations.md` for the full Select pattern and contract extension.

### Fields

Layout rule: if the model has any `HasOne` or `HasMany` relationship, fields must be wrapped in `Tab::group()` with `Tab::make(__('Details'), [...])` for own fields plus one tab per relationship — see `references/aggregate-tabs.md` for the visibility-guard pattern. Flat `fields()` is only allowed when the model has zero HasOne/HasMany. Never expose `id` as a Nova field.

For the full per-column-type field selection table, standard modifiers, the canonical `created_at`/`updated_at` and `Badge` status patterns, the color convention, and when to extract `fieldsForCreate()`, see `references/fields-catalog.md`.

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
- The entity an Action operates on comes from the Action's SIPOC "Target resource(s)" line (or its primary model parameter) — read `docs/plan/sipoc/{id}.md` and the Action's `parameters()`.
- `canSee` is a UI affordance, not security — the Action's `handle()`/`canRun()` remains the authoritative guard.

The full pattern catalogue is copied from logic into `references/canSee-patterns.md`. This registration happens in its own phase (see Steps → "Register Actions on Resources").

### Cards, Repeatables, Shared Fields

- **Cards (Metrics)** — only add a `cards()` method when metrics are defined. Always use `->onlyOnDetail()` unless the metric belongs on the index. Metric classes live in `src/Nova/Metrics/`.
- **Repeatables** — for strongly-composed value collections edited inline in the parent form, use Nova Repeatables. The child still gets its own Resource. Full pattern + reconciliation in `references/repeatables.md`.
- **Shared Fields** — when a Resource and its Repeatables share a field set, extract a `{ModelName}Fields` trait instead of redeclaring. Full pattern in `references/shared-fields.md`.

### Code templates

The authoritative templates live on disk:

- `templates/resource.php.tmpl` — Nova Resource
- `templates/field-trait.php.tmpl` — shared `{ModelName}Fields` trait
- `templates/repeatable.php.tmpl` — Nova Repeatable

The JSON contract for each is documented at the top of the matching `scripts/generate-*.mjs` file. The skill never hand-writes Resource PHP — normalize the inputs into the JSON contract and let the script render the `.tmpl`.

### Domain Rules

1. **One entity = one bundle task in `tasks.md`** — Resource (+ Fields trait, + Repeatable only for strongly-composed collections) ships as a single tracked task. Each Nova bundle task `depends_on` its corresponding `opscale-domain` bundle task.
2. **One Resource per DBML entity** — every table in `docs/plan/dbml.txt` gets its own navigable Resource, parent or child. Each Resource renders its own has-many/has-one relations as tabs. Repeatables are an inline-editing convenience on the parent, never a replacement for the child's Resource.
3. **No business logic** — Nova Resources are pure UI. No calculations, no service calls, no Eloquent queries inline.
4. **All strings translatable — zero exceptions** — every user-visible string must be wrapped in `__()`. Only technical identifiers stay untranslated.
5. **Never expose `id` as a Nova field** — no `ID::make()`, no `Text::make('ID', 'id')`. Human-meaningful business identifiers live in their own column.
6. **Foreign keys must use relationship fields** — any column ending in `_id` or marked as `ref:` in the DBML must be exposed via `BelongsTo::make()` (or `MorphTo::make()` for polymorphic). Always add `->searchable()`.
7. **Tabs MANDATORY for HasOne/HasMany on every Resource** — wrap fields in `Tab::group()` with `Tab::make(__('Details'), [...])` for own fields plus one `Tab::make` per relationship. Applies to every entity's Resource, not just aggregate roots.
8. **Badge for status** — status columns always use `Badge`. Color convention: success/warning/danger/info.
9. **DateTime always diffForHumans** — `->displayUsing(fn ($v) => $v?->diffForHumans())->exceptOnForms()`.
10. **Authorization confirmed per resource** — for every aggregate the skill must ask `can create? / can update? / can delete?` and pass answers to `generate-resource.mjs`.
11. **`fieldsForCreate()` when needed** — extract create/edit fields when they differ from the display view.
12. **Every Action is registered on exactly one Resource** — each Action in `src/Services/Actions/` is added to the `actions()` of the Resource for the entity it operates on, wrapped in the `canSee` guard matching its SIPOC precondition (`references/canSee-patterns.md`). No Action is left unwired; no Action is registered on two Resources.
13. **`@extends Resource<Model>`** — always add the generic docblock for IDE type inference.
14. **Every entity = Resource + shared trait (+ Repeatable when strongly composed)** — the Fields trait always ships; the Repeatable only for value collections edited inline in a parent.
15. **Shared fields trait** — `Nova/Concerns/{ModelName}Fields.php` holds `coreFields()`. Both the Resource and Repeatable use it via `use {ModelName}Fields`.
16. **Rules via `Model::$validationRules`** — never duplicate rules inline. Use spread: `->rules(...Model::$validationRules['col'])`.
17. **`uriKey()`, `label()`, `singularLabel()` MANDATORY — labels are CONTEXTUAL translations.** `uri_key`, `label`, `singular_label`, `label_es`, `singular_label_es` are required JSON inputs.
18. **Lang seeded for BOTH `en` and `es` automatically** — `generate-resource.mjs` and `generate-field-trait.mjs` append every user-visible string to BOTH `lang/en.json` AND `lang/es.json` in a single run. Existing keys are never overwritten. EN-only seeding is forbidden.
19. **Every Resource renders its own relations as tabs.** Tab visibility follows the creatable-from-UI rule. Counts are loaded via Nova `$with` / `indexQuery()` withCount on the **Resource**, never on the Eloquent model.
20. **Child-entity Resources must emit `redirectAfterCreate()`.** The generator emits this method automatically when the JSON contract carries `child_of: { parent_uri, foreign_key }`, landing the operator on the parent's detail page.
21. **Cross-subdomain logical refs render as Select, never Text** — `Select::make(...)->options(fn () => app({Repo}::class)->forSelect())->searchable()->filterable()->displayUsingLabels()`. Text + `->help('Logical reference…')` is no longer accepted.
22. **Browser/flow tests are part of this skill's output** — one `tests/Browser/{Flow}FlowTest.php` per subprocess of `docs/plan/process.txt`, driving the flow through Nova. Asserts are user-visible only (toast / redirect / row) — never DB. Generated by the `web-test-generator` agent.

## Steps

### Phase 1 — Inventory every entity (ontology manifest first)

Read `docs/plan/ontology.txt` / `ontology.mmd` as the **manifest** — the authoritative list of what the module contains and how it hangs together (Software → Domain → Module → Subprocess → Business Step → Operation, plus the stamped entities in the `%% entity:` lines). Then read `docs/plan/dbml.dbml` + `docs/plan/dbml.txt` and `docs/plan/bpmn.bpmn` + `docs/plan/bpmn.txt` as the **detail**: `dbml.txt` is the definitive per-entity list (one entity per line), `dbml.dbml` gives each entity's columns and relations, and the BPMN gives the Actions (`businessRuleTask`) that operate on each entity.

Build the inventory with **one Resource per entity** — every line of `dbml.txt`, not only aggregate roots. Cross-reference `src/Models/` to confirm each entity has a model. For each entity note its has-many/has-one relations (→ tabs) and which BPMN Actions target it (→ `actions()` registration in a later phase):

```
Nova UI inventory for [Module Name]:

Entities ([N] — one Resource each):
  1. [EntityA]  →  Resource + {EntityA}Fields trait          relations: [rel→tab, …]   actions: [ActionX, …]
  2. [EntityB]  →  Resource + {EntityB}Fields trait (+ Repeatable, strongly composed in [EntityA])
  ...

Flows (from process.txt subprocesses — one Browser test each):
  SP-01 [Flow name]
  SP-02 [Flow name]
  ...
```

**Wait for user approval before continuing.**

### Phase 2 — Propose Resource layout via spec-kit

Like `opscale-domain`, the UI layer formalizes its plan through spec-kit so each entity becomes a tracked task inside the MVP feature (`.specify/specs/001-mvp/`). The atomic unit is **the Nova bundle per entity**: Resource + shared Fields trait (+ Repeatable when the entity is a strongly-composed value collection), plus any field customizations (`Concerns/`). Two extra task kinds cover the new responsibilities: **Action registration** and **Browser flow tests**.

**2a. Run `/speckit.plan`** with the entity + flow list:

```
/speckit.plan "Nova UI layer for {module-name}: [N] entities from docs/plan/dbml.txt.
Generate one task per entity, each covering its full Nova bundle:
  - 1 Resource at src/Nova/{ModelName}.php
  - 1 shared Fields trait at src/Nova/Concerns/{ModelName}Fields.php
  - 1 Repeatable at src/Nova/Repeatables/{ModelName}.php (only for strongly-composed value collections)

Plus:
  - 1 task 'Register Actions on Resources' — wire every src/Services/Actions/ Action onto its Resource's actions() with canSee.
  - 1 task per subprocess in docs/plan/process.txt — a Browser flow test at tests/Browser/{Flow}FlowTest.php.
  - 1 task per Nova Menu / Dashboard / shared Filter (only if defined in spec)."
```

Confirm `plan.md` with the user.

**2b. Run `/speckit.tasks`** with the bundle contract:

| Task field | Value |
|------------|-------|
| Title | `Implement {EntityName} Nova bundle` |
| Description | "Expose {EntityName} in the Nova admin panel" |
| Outputs | `src/Nova/{Name}.php` + `src/Nova/Concerns/{Name}Fields.php` (+ `src/Nova/Repeatables/{Name}.php` when applicable) |
| Acceptance | Resource registered, no `ID` field exposed, FKs use BelongsTo/MorphTo, all labels via `__()`, Tabs used if model has HasOne/HasMany |
| Depends on | The domain task for the same entity (must be complete) |

Plus the two cross-cutting tasks:

| Task | Outputs | Acceptance |
|------|---------|------------|
| `Register Actions on Resources` | edited `src/Nova/*.php` `actions()` blocks | Every Action in `src/Services/Actions/` registered on exactly one Resource with the correct `canSee` guard |
| `Browser flow test — {Subprocess}` | `tests/Browser/{Flow}FlowTest.php` | One `#[Test]` per path; every `submitForm()` paired with `assertNoErrorToast()`; user-visible asserts only |

**Verify `tasks.md`:**

```
[ ] One bundle task per entity — count matches dbml.txt line count
[ ] Each task lists Resource + Fields trait (+ Repeatable when applicable) in Outputs
[ ] One 'Register Actions on Resources' task
[ ] One 'Browser flow test' task per process.txt subprocess
[ ] Each task depends_on its domain bundle counterpart
[ ] Resource/Fields trait/Repeatable never split across tasks
```

If any check fails, regenerate `tasks.md` before continuing.

**Wait for user approval before continuing.**

### Phase 3 — Per-resource authorization confirmation

For each entity in the inventory, **ask the user** which CRUD operations the Resource should expose in Nova. The defaults are not assumed — the skill must prompt explicitly:

```
For each aggregate, confirm Nova CRUD access:

  [ModelA]
    can create? (Y/n)
    can update? (Y/n)
    can delete? (Y/n)

  [ModelB]
    can create? (Y/n)
    can update? (Y/n)
    can delete? (Y/n)
  ...
```

The answers map directly to the JSON contract of `generate-resource.mjs`: `can_create`, `can_update`, `can_delete`. When any flag is `false`, the generated Resource emits the corresponding `authorizedTo*` method returning `false`. When all three are `true`, no overrides are emitted.

Read-only / system-generated resources answer `n / n / n`. State-locked resources answer `Y` here and get a custom guard added in the customization pass.

Do not proceed to generation until every entity has all three answers recorded.

**Wait for user approval before continuing.**

### Phase 3b — Per-resource contextual labels (EN + ES)

For each entity, ask the user for the **contextual** plural and singular label in both English and Spanish. Do NOT auto-derive from the entity name — only the operator/owner knows whether `application` in `credits` should read "Credit application" vs "Loan application". Reject empty answers, reject literal `subdomain · entity` concatenations, reject the bare entity name when more than one subdomain is in play. Enum option labels and any custom Tab labels get the same EN/ES treatment.

For the verbatim prompt template, the JSON contract mapping, and the EN/ES seeding rules, see `references/lang-seeding.md`.

**Wait for user approval before continuing.**

### Phase 4 — Generate Nova bundles (one per entity)

Generation is **always deterministic**. The skill normalizes each entity into the JSON contract for each script, then spawns the wrapper agents in parallel — one Resource + one Fields trait per DBML entity, plus a Repeatable only for strongly-composed collections.

| Script | Template | Agent |
|--------|----------|-------|
| `scripts/generate-field-trait.mjs` | `templates/field-trait.php.tmpl` | field-trait-generator |
| `scripts/generate-resource.mjs` | `templates/resource.php.tmpl` | resource-generator |
| `scripts/generate-repeatable.mjs` | `templates/repeatable.php.tmpl` | repeatable-generator (only for strongly-composed collections) |

Ordering inside an entity's bundle: field-trait first (so the Resource and any Repeatable can consume it), then the Resource (and Repeatable) in parallel. Entity bundles themselves run fully in parallel — there are no cross-entity dependencies in this phase.

The JSON contract for each script lives in its header comment. The skill is responsible for picking the right Nova field per column (`Text` / `Select` / `BelongsTo` / `Boolean` / `Number` / `DateTime` …) and emitting the `status_badge` map, `has_many_relationships`, and `has_one_relationships` lists — the script does not look at the Eloquent model. Every entity's has-many/has-one relations become tabs on **its own** Resource (`child_of` is set on child entities so `redirectAfterCreate()` is emitted).

> **Generator contract — one Resource per entity + relation tabs.** `generate-resource.mjs` renders one Resource per invocation; producing one-per-entity is a matter of invoking it once per `dbml.txt` line. It already emits `has_many_relationships` as tabs and `child_of` → `redirectAfterCreate()`. `has_one_relationships` renders as `HasOne` tabs the same way as `has_many` (mirror the `has_many` handling). **TODO (acotado):** if `has_one_relationships` is not yet wired in `scripts/generate-resource.mjs` + `templates/resource.php.tmpl`, add it mirroring `has_many_relationships` (import `HasOne`, one `Tab::make` per relation, `->onlyOnDetail()` on the `HasOne` field). Do NOT hand-write Resource PHP — extend the template/script.

**Business types drive field selection.** Before picking a field heuristically, check the column's DBML **type**: the business-type slug IS the declared column type (`contact_email email`), and the field, its `config`, and its `->help()` hint come from the Laravel/Nova **binding** (`.specify/memory/business-types.php`; canonical slugs in `docs/plan/context/business-types.md`) — an `email` column renders `Email::make`, a `money` column renders `Currency::make` with its currency config, never a bare `Text::make`. Heuristics apply only to Enum-typed columns (they render as the Enum's select). **Why:** the registry is what guarantees the same business type looks and validates identically across every module.

**Three invariants the JSON normalization must enforce** (the scripts assume they hold):

- Every label the user sees is provided in human form — the script wraps every label, `Tab::make`, `Badge::labels` entry, `Select::options` value label, and `->help()` text in `__()` automatically.
- Foreign keys with real Eloquent relationships are emitted as `BelongsTo::make` fields. Logical cross-subdomain refs become `Select::make(...)` (see `references/virtual-relations.md`).
- Resources with HasMany/HasOne **must** have `has_many_relationships` / `has_one_relationships` populated — the script applies `Tab::group(...)` automatically when either list is non-empty.

After generation, append the Nova layer table to `.specify/specs/001-mvp/plan.md` with the `Task ID` column tying each file back to its `tasks.md` entry.

**Wait for user approval before continuing.**

### Phase 5 — Register Actions on Resources

`opscale-logic` already produced the Action classes in `src/Services/Actions/`. Wire each one onto the Resource for the entity it operates on — this responsibility **moved here from `opscale-logic` Phase 4**.

For each Action:

1. **Find its target Resource.** Read the Action's SIPOC (`docs/plan/sipoc/{id}.md`, "Target resource(s)" line) and its `parameters()` primary model — that entity's Resource is where the Action registers.
2. **Determine the `canSee` guard** from the SIPOC's Business Rules / Process preconditions, using `references/canSee-patterns.md`:
   - single state → `->canSee(fn ($request) => $request->findModel()?->status?->is({Enum}::{State}))`
   - multiple states → `in_array($request->findModel()?->status, [...], strict: true)`
   - role → `$request->user()?->can('{permission}')`
   - state + role → both, joined with `&&`
   - no precondition → register without `canSee`
3. **Add the Action** to that Resource's `actions()` method via `{Action}::make()->canSee(...)`.

Every Action lands in exactly **one** Resource's `actions()`; no Action is left unwired. `canSee` is a UI affordance only — the Action body remains the authoritative guard. Append the wiring to `.specify/specs/001-mvp/plan.md` (Action → Resource → canSee shape).

**Wait for user approval before continuing.**

### Phase 6 — Generate Browser/flow tests

Author the end-to-end Browser tests that drive the module through Nova — this responsibility **moved here from `opscale-test`**. **One flow = one subprocess** of `docs/plan/process.txt`.

For each subprocess block in `process.txt`, spawn the `web-test-generator` agent with:

- `flow_name` / `flow_id` — from the subprocess header (`SP-XX {name}`)
- `steps` — the subprocess's ordered steps, mapped to Nova interactions; read `docs/plan/bpmn.txt` for the operations under each step (CRUD → form submit; Logic → Action modal)
- `resources_involved` — the Resources (URI keys) the flow touches
- `actions_triggered` — the Action identifiers invoked in the flow
- `package_namespace`, `output_dir: tests/Browser/`

The agent writes `tests/Browser/{Flow}FlowTest.php` — one `#[Test]` per path (happy + each gateway branch + each UI-visible failure). **Assertions are user-visible only** — success/error toast (`assertNoErrorToast()` after every `submitForm()`), redirect, list row, persisted field value — **never DB state** (that is the Feature suite's job, owned by `opscale-logic`). Login via `$this->loginToNova($browser)` using the Dusk harness `opscale-init` stood up.

**Seed data:** flows start from real pages, so records must exist. Reuse the domain factories/seeder — either drive the create path through the Nova form itself, or seed via `workbench/database/seeders/DatabaseSeeder` before the flow.

Add one `Browser flow test — {Subprocess}` task per subprocess to `.specify/specs/001-mvp/tasks.md`.

**Wait for user approval before continuing.**

### Phase 7 — Gate — linters + Browser tests green

The module is feature-complete only when the UI compiles, boots, and the flows pass end-to-end. Run, in order:

1. **Resource smoke checks** — `php -l` on every file, reflection-load every Resource class, `testbench workbench:build` boots with Nova mounted. Verbatim commands in `references/smoke-gate.md`.
2. **Linters** — `composer run lint` (Pint / PHPStan per `opscale-init`) clean.
3. **Browser tests** — `composer run test:browser` green (chains `build`, runs the Dusk suite headless against the Nova DevTool workbench).

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
