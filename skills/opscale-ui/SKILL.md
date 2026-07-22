---
name: opscale-ui
description: >
  Generates Laravel Nova Resource classes (one per aggregate root) from the
  DBML + BPMN. Step 6 — runs after opscale-domain, before opscale-logic.
  Trigger: "generate the Nova resources", "create the admin panel", "build the
  UI layer".
  Use it whenever Nova Resource/admin-panel classes must be generated, even if just "build the admin". Not for the domain layer (opscale-domain) or Action logic (opscale-logic).
---

# opscale-ui

## Context

### Purpose

Generate Laravel Nova Resource classes that expose domain entities in the admin panel. Every field, relationship, and authorization rule is derived directly from the DBML and spec — nothing is invented. Output files are written to `src/Nova/` and listed in `.specify/specs/{NNN}-{module-name}/plan.md` (Nova section).

### Prerequisites — Plan phase + opscale-domain MUST be complete

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | `opscale-process` has been run | `final/process.md` exists and PASS | Stop. Run `/opscale-process`. |
| 3 | `opscale-dbml` has been run | `final/domain.dbml` exists and PASS | Stop. Run `/opscale-dbml`. |
| 4 | `opscale-bpmn` has been run | `final/process.bpmn` exists and PASS | Stop. Run `/opscale-bpmn`. |
| 5 | `opscale-domain` has been run | `src/Models/` contains one model per DBML aggregate root | Stop. Run `/opscale-domain`. |
| 6 | `tasks.md` entries for all domain bundles marked complete | Check `tasks.md` for unchecked `Implement {Entity}` items | Finish pending domain tasks before starting UI. |

This skill is **Step 2 of the Generate phase**. Order is strict: `domain → ui → logic`. After this skill, `opscale-logic` is next.

### Generator contract — scaffold, then customize

The generators in `scripts/` **minimize the code the LLM writes** — they do not finish the Resource. Each generator emits the **initial scaffold** (one Resource per model); you then **always customize**:

- **Fields** — a template cannot infer every field, its display, validation, or relation; complete them per entity.
- **Authorization, Actions, Cards, Repeatables** — add what the screen actually needs.

Rule: run the generator first, then read each generated Resource and complete it. One Resource per model — no exceptions.

### Output file structure

```
src/
└── Nova/
    ├── {ModelName}.php             (Resource — one per aggregate root)
    ├── Concerns/
    │   └── {ModelName}Fields.php    (shared fields trait)
    └── Repeatables/
        └── {ModelName}.php          (Repeatable — consumes shared trait)
```

One Resource per aggregate root. Child entities (accessed via `HasMany`) do not need their own Resource unless they appear as standalone menu items.

### Resource anatomy

Every Resource follows a fixed structure: static properties → URI + labels → authorization overrides → `fields()` → optional `fieldsForCreate()` / `cards()` / `actions()`. For the verbatim class skeleton (with placeholder method signatures in canonical order), see `references/resource-anatomy.md` — it also documents `redirectAfterCreate()` for non-root aggregates and the authorization-override patterns (read-only and state-locked).

### Static properties

- `$model` — always the full class-string of the Eloquent model
- `$title` — the column that identifies the record in Nova UI (typically `name`, `subject`, `title`, or `id`)
- `$search` — only text columns meaningful for lookup. Never include `id`.

### URI + Labels — contextual translation, MANDATORY on every Resource

`uriKey()`, `label()`, `singularLabel()` are non-optional and labels MUST be **contextual translations**, not literal `subdomain · entity` joins. The generator prompts the user for EN and ES per resource. Both label methods go through `__()`.

### i18n — seed BOTH `lang/en.json` AND `lang/es.json`

Every `__()`-wrapped string MUST have keys in both `lang/en.json` and `lang/es.json` immediately after generation. EN-only seeding shifts work to the user post-generation and gets silently dropped. Existing keys are never overwritten — re-runs only fill gaps.

For the full i18n contract — the three sources of translation values, the URI+label method shape, the contextual-label rules and example — see `references/lang-seeding.md`.

### After-create redirect, authorization patterns

Non-root aggregate resources emit `redirectAfterCreate()` so the operator lands on the parent's detail URL with the new child visible in its tab. Authorization has two layers: a hard floor set per resource (`can_create` / `can_update` / `can_delete` answers emit `authorizedTo*` returning `false`) and state-conditional overrides added in the customization pass. For verbatim code, see `references/resource-anatomy.md`.

### Aggregates rendered as tabs of their root (mandatory)

Every child aggregate of an aggregate root is rendered as a `Tab::make(...)` inside the **root** resource's `fields()` via `Tab::group(...)` — NEVER as a top-level resource visible in the menu. The full pattern, including the visibility table, the `withCount` placement, and the canonical code block, lives in `references/aggregate-tabs.md`.

The two rules the skill enforces every time:

1. **Visibility per tab:**
   - **Creatable from UI** (operator can add the first child via Nova) → tab ALWAYS visible.
   - **System-only** (children only created by Actions / events) → tab HIDDEN when count = 0.
2. **Counts via Nova, not Eloquent.** Use `public static $with = [...]` or `indexQuery()` `withCount(...)` on the Resource — NEVER `$withCount` on the Model. A model-level withCount runs on every query and is the canonical source of N+1 on index pages.

### Virtual (cross-subdomain) relations — Select, searchable, filterable

Logical refs across subdomains (no foreign-key constraint, resolved through a `*Contract` per `opscale-domain`) are NOT rendered as `Text::make(...)->help('Logical reference…')`. They are rendered as a real `Select::make(...)->options(fn () => app({Repo}::class)->forSelect())->searchable()->filterable()->displayUsingLabels()`. The foreign repository contract MUST expose `forSelect(): array` returning `[id => label]`. See `references/virtual-relations.md` for the full Select pattern and contract extension.

### Fields

Layout rule: if the model has any `HasOne` or `HasMany` relationship, fields MUST be wrapped in `Tab::group()` with `Tab::make(__('Details'), [...])` for own fields plus one tab per relationship — see `references/aggregate-tabs.md` for the visibility-guard pattern. Flat `fields()` is only allowed when the model has zero HasOne/HasMany. Never expose `id` as a Nova field.

For the full per-column-type field selection table, standard modifiers, the canonical `created_at`/`updated_at` and `Badge` status patterns, the color convention, and when to extract `fieldsForCreate()`, see `references/fields-catalog.md`.

### Actions, Cards, Repeatables, Shared Fields

- **Actions** — only add an `actions()` method when the BPMN has `businessRuleTask` or `sendTask` nodes for this entity. Each Action class lives in `src/Nova/Actions/`. Use `::make()` factory pattern.
- **Cards (Metrics)** — only add a `cards()` method when metrics are defined. Always use `->onlyOnDetail()` unless the metric belongs on the index. Metric classes live in `src/Nova/Metrics/`.
- **Repeatables** — when an aggregate owns child rows edited inline, use Nova Repeatables. Full pattern in `references/repeatables.md`.
- **Shared Fields** — when a Resource and its Repeatables share a field set, extract a `{ModelName}Fields` trait instead of redeclaring. Full pattern in `references/shared-fields.md`.

### Code templates

The authoritative templates live on disk:

- `templates/resource.php.tmpl` — Nova Resource
- `templates/field-trait.php.tmpl` — shared `{ModelName}Fields` trait
- `templates/repeatable.php.tmpl` — Nova Repeatable

The JSON contract for each is documented at the top of the matching `scripts/generate-*.mjs` file. The skill never hand-writes Resource PHP — normalize the inputs into the JSON contract and let the script render the `.tmpl`.

### Domain Rules

1. **One aggregate = one bundle task in `tasks.md`** — Resource + Repeatable + Fields trait always ship together as a single tracked task. Each Nova bundle task `depends_on` its corresponding `opscale-domain` bundle task.
2. **One Resource per aggregate root** — child entities shown via `HasMany` inside tabs do not get their own standalone Resource unless they appear independently in the sidebar.
3. **No business logic** — Nova Resources are pure UI. No calculations, no service calls, no Eloquent queries inline.
4. **All strings translatable — zero exceptions** — every user-visible string MUST be wrapped in `__()`. Only technical identifiers stay untranslated.
5. **Never expose `id` as a Nova field** — no `ID::make()`, no `Text::make('ID', 'id')`. Human-meaningful business identifiers live in their own column.
6. **Foreign keys MUST use relationship fields** — any column ending in `_id` or marked as `ref:` in the DBML MUST be exposed via `BelongsTo::make()` (or `MorphTo::make()` for polymorphic). Always add `->searchable()`.
7. **Tabs MANDATORY for HasOne/HasMany** — wrap fields in `Tab::group()` with `Tab::make(__('Details'), [...])` for own fields plus one `Tab::make` per relationship.
8. **Badge for status** — status columns always use `Badge`. Color convention: success/warning/danger/info.
9. **DateTime always diffForHumans** — `->displayUsing(fn ($v) => $v?->diffForHumans())->exceptOnForms()`.
10. **Authorization confirmed per resource** — for every aggregate the skill MUST ask `can create? / can update? / can delete?` and pass answers to `generate-resource.mjs`.
11. **`fieldsForCreate()` when needed** — extract create/edit fields when they differ from the display view.
12. **Actions only from BPMN** — only add `actions()` when the BPMN has `businessRuleTask` or `sendTask` nodes for this entity.
13. **`@extends Resource<Model>`** — always add the generic docblock for IDE type inference.
14. **Every aggregate = Resource + Repeatable + shared trait** — always generate all three files per aggregate root.
15. **Shared fields trait** — `Nova/Concerns/{ModelName}Fields.php` holds `coreFields()`. Both the Resource and Repeatable use it via `use {ModelName}Fields`.
16. **Rules via `Model::$validationRules`** — never duplicate rules inline. Use spread: `->rules(...Model::$validationRules['col'])`.
17. **`uriKey()`, `label()`, `singularLabel()` MANDATORY — labels are CONTEXTUAL translations.** `uri_key`, `label`, `singular_label`, `label_es`, `singular_label_es` are required JSON inputs.
18. **Lang seeded for BOTH `en` and `es` automatically** — `generate-resource.mjs` and `generate-field-trait.mjs` append every user-visible string to BOTH `lang/en.json` AND `lang/es.json` in a single run. Existing keys are never overwritten. EN-only seeding is forbidden.
19. **Aggregates render as tabs of the root, never as top-level resources.** Tab visibility follows the creatable-from-UI rule. Counts are loaded via Nova `$with` / `indexQuery()` withCount on the **Resource**, NEVER on the Eloquent model.
20. **Non-root aggregate Resources MUST emit `redirectAfterCreate()`.** The generator emits this method automatically when the JSON contract carries `child_of: { resource, foreign_key }`.
21. **Cross-subdomain logical refs render as Select, never Text** — `Select::make(...)->options(fn () => app({Repo}::class)->forSelect())->searchable()->filterable()->displayUsingLabels()`. Text + `->help('Logical reference…')` is no longer accepted.

## Steps

### Phase 1 — Inventory aggregate roots

Walk `src/Models/` and identify every aggregate root (model not consumed only as a HasMany child). Cross-reference with `final/domain.dbml` to confirm. Present the inventory:

```
Nova UI inventory for [Module Name]:

Aggregate roots ([N]):
  1. [ModelA]  →  Resource + Repeatable + {ModelA}Fields trait
  2. [ModelB]  →  Resource + Repeatable + {ModelB}Fields trait
  ...
```

**Wait for user approval before continuing.**

### Phase 2 — Propose Resource layout via spec-kit

Like `opscale-domain`, the UI layer formalizes its plan through spec-kit so each aggregate becomes a tracked task. The atomic unit is **the Nova bundle per aggregate**: Resource + Repeatable + shared Fields trait, plus any field customizations (`Concerns/`).

**2a. Run `/speckit.plan`** with the aggregate list:

```
/speckit.plan "Nova UI layer for {module-name}: [N] aggregate roots from src/Models/.
Generate one task per aggregate, each covering its full Nova bundle:
  - 1 Resource at src/Nova/{ModelName}.php
  - 1 Repeatable at src/Nova/Repeatables/{ModelName}.php
  - 1 shared Fields trait at src/Nova/Concerns/{ModelName}Fields.php

Plus separate tasks for cross-aggregate concerns when needed:
  - 1 task per Nova Menu / Dashboard / shared Filter (only if defined in spec)."
```

Confirm `plan.md` with the user.

**2b. Run `/speckit.tasks`** with the bundle contract:

| Task field | Value |
|------------|-------|
| Title | `Implement {AggregateName} Nova bundle` |
| Description | "Expose {AggregateName} in the Nova admin panel" |
| Outputs | `src/Nova/{Name}.php` + `src/Nova/Repeatables/{Name}.php` + `src/Nova/Concerns/{Name}Fields.php` |
| Acceptance | Resource registered, no `ID` field exposed, FKs use BelongsTo/MorphTo, all labels via `__()`, Tabs used if model has HasOne/HasMany |
| Depends on | The domain task for the same aggregate (must be complete) |

**Verify `tasks.md`:**

```
[ ] One bundle task per aggregate — count matches the inventory
[ ] Each task lists Resource + Repeatable + Fields trait in Outputs
[ ] Each task has a matching 'Test ' task preceding it
[ ] Each task depends_on its domain bundle counterpart
[ ] Resource/Repeatable/Fields trait never split across tasks
```

If any check fails, regenerate `tasks.md` before continuing.

**Wait for user approval before continuing.**

### Phase 3 — Per-resource authorization confirmation

For each aggregate in the inventory, **ask the user** which CRUD operations the Resource should expose in Nova. The defaults are not assumed — the skill MUST prompt explicitly:

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

Do not proceed to generation until every aggregate has all three answers recorded.

**Wait for user approval before continuing.**

### Phase 3b — Per-resource contextual labels (EN + ES)

For each aggregate, ask the user for the **contextual** plural and singular label in both English and Spanish. Do NOT auto-derive from the entity name — only the operator/owner knows whether `application` in `credits` should read "Credit application" vs "Loan application". Reject empty answers, reject literal `subdomain · entity` concatenations, reject the bare entity name when more than one subdomain is in play. Enum option labels and any custom Tab labels get the same EN/ES treatment.

For the verbatim prompt template, the JSON contract mapping, and the EN/ES seeding rules, see `references/lang-seeding.md`.

**Wait for user approval before continuing.**

### Phase 4 — Generate Nova bundles

Generation is **always deterministic**. The skill normalizes each aggregate into the JSON contract for each script, then spawns the wrapper agents in parallel — one of each per aggregate root.

| Script | Template | Agent |
|--------|----------|-------|
| `scripts/generate-field-trait.mjs` | `templates/field-trait.php.tmpl` | field-trait-generator |
| `scripts/generate-resource.mjs` | `templates/resource.php.tmpl` | resource-generator |
| `scripts/generate-repeatable.mjs` | `templates/repeatable.php.tmpl` | repeatable-generator |

Ordering inside an aggregate's bundle: field-trait first (so the Resource and Repeatable can consume it), then the Resource and Repeatable in parallel. Aggregate bundles themselves run fully in parallel — there are no cross-aggregate dependencies in this phase.

The JSON contract for each script lives in its header comment. The skill is responsible for picking the right Nova field per column (`Text` / `Select` / `BelongsTo` / `Boolean` / `Number` / `DateTime` …) and emitting the `status_badge` map and `has_many_relationships` list — the script does not look at the Eloquent model.

**Business types drive field selection.** Before picking a field heuristically, check the column's DBML note: a `// type:{slug}` note means the field, its `config`, and its `->help()` hint come from the Laravel/Nova **binding** (`.specify/memory/business-types.php`; canonical slugs in `.specify/memory/business-types.md`) — an `email` column renders `Email::make`, a `money` column renders `Currency::make` with its currency config, never a bare `Text::make`. Heuristics apply only to columns with no `type:` note. **Why:** the registry is what guarantees the same business type looks and validates identically across every module.

**Three invariants the JSON normalization must enforce** (the scripts assume they hold):

- Every label the user sees is provided in human form — the script wraps every label, `Tab::make`, `Badge::labels` entry, `Select::options` value label, and `->help()` text in `__()` automatically.
- Foreign keys with real Eloquent relationships are emitted as `BelongsTo::make` fields. Logical cross-subdomain refs become `Select::make(...)` (see `references/virtual-relations.md`).
- Resources with HasMany **must** have `has_many_relationships` populated — the script applies `Tab::group(...)` automatically when this list is non-empty.

After generation, append the Nova layer table to `plan.md` with the `Task ID` column tying each file back to its `tasks.md` entry.

**Wait for user approval before continuing.**

### Phase 5 — Smoke gate

Resource templates that compile fine often fail at runtime — missing imports, wrong namespace for a referenced HasMany child, `__()` on a non-string, enum referenced before existing. The auto-reported checkboxes don't catch any of this. Three checks: (1) `php -l` on every file, (2) reflection-load every Resource class, (3) `testbench workbench:build` boots with Nova mounted. Any failure means the skill is NOT done.

For the verbatim shell commands, see `references/smoke-gate.md`. Do NOT mark the gate `PASS` based on file count alone — reflection-load is the cheapest way to catch the bugs that hide behind syntactically valid PHP.

**Wait for user approval before continuing.**

## Sample

Nova Resource excerpt with `Tab::group` + `redirectAfterCreate` + `Select` virtual relation — see `references/sample-output.md`.

## Success condition

```bash
vendor/bin/testbench workbench:build && vendor/bin/testbench tinker --execute="reflectAllResources()"
```

Exit code 0 = pass.
