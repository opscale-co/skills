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

## Purpose

Generate Laravel Nova Resource classes that expose domain entities in the admin panel.
Every field, relationship, and authorization rule is derived directly from the DBML
and spec — nothing is invented.

Output files are written to `src/Nova/` and listed in
`.specify/specs/{NNN}-{module-name}/plan.md` (Nova section).

---

## Prerequisites — Plan phase + opscale-domain MUST be complete

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | `opscale-process` has been run | `spec.md` exists and PASS | Stop. Run `/opscale-process`. |
| 3 | `opscale-dbml` has been run | `data-model.md` exists and PASS | Stop. Run `/opscale-dbml`. |
| 4 | `opscale-bpmn` has been run | `process.md` exists and PASS | Stop. Run `/opscale-bpmn`. |
| 5 | `opscale-domain` has been run | `src/Models/` contains one model per DBML aggregate root | Stop. Run `/opscale-domain`. |
| 6 | `tasks.md` entries for all domain bundles marked complete | Check `tasks.md` for unchecked `Implement {Entity}` items | Finish pending domain tasks before starting UI. |

This skill is **Step 2 of the Generate phase**. Order is strict: `domain → ui → logic`. After this skill, `opscale-logic` is next.

---

## Generator contract — scaffold, then customize

The generators in `scripts/` **minimize the code the LLM writes** — they do not finish the Resource. Each generator emits the **initial scaffold** (one Resource per model); you then **always customize**:

- **Fields** — a template cannot infer every field, its display, validation, or relation; complete them per entity.
- **Authorization, Actions, Cards, Repeatables** — add what the screen actually needs.

Rule: run the generator first, then read each generated Resource and complete it. One Resource per model — no exceptions.

## Output: File Structure

```
src/
└── Nova/
    ├── {ModelName}.php             (Resource — one per aggregate root)
    ├── Concerns/
    │   └── {ModelName}Fields.php    (shared fields trait)
    └── Repeatables/
        └── {ModelName}.php          (Repeatable — consumes shared trait)
```

One Resource per aggregate root. Child entities (accessed via `HasMany`) do not need
their own Resource unless they appear as standalone menu items.

---

## Workflow

### Phase 1 — Inventory

Walk `src/Models/` and identify every aggregate root (model not consumed only as a
HasMany child). Cross-reference with `data-model.md` to confirm. Present the
inventory and confirm with the user:

```
Nova UI inventory for [Module Name]:

Aggregate roots ([N]):
  1. [ModelA]  →  Resource + Repeatable + {ModelA}Fields trait
  2. [ModelB]  →  Resource + Repeatable + {ModelB}Fields trait
  ...

Confirm before generating?
```

### Phase 2 — Drive spec-kit: one task per aggregate (bundle)

Like `opscale-domain`, the UI layer formalizes its plan through spec-kit so each
aggregate becomes a tracked task. The atomic unit is **the Nova bundle per
aggregate**: Resource + Repeatable + shared Fields trait, plus any field
customizations (`Concerns/`).

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

```
/speckit.tasks "Generate one task per aggregate Nova bundle from plan.md.
Each task lists Resource + Repeatable + Fields trait in Outputs. Dependency
edges link each Nova bundle task to its corresponding domain bundle task.
Precede every implementation task with a 'Test {Aggregate} Resource' task
(opscale-test fills it with a Browser smoke test later). Do not split Resource,
Repeatable, and Fields trait into separate tasks — they always ship together."
```

**Verify `tasks.md`:**

```
[ ] One bundle task per aggregate — count matches the inventory
[ ] Each task lists Resource + Repeatable + Fields trait in Outputs
[ ] Each task has a matching 'Test ' task preceding it
[ ] Each task depends_on its domain bundle counterpart
[ ] Resource/Repeatable/Fields trait never split across tasks
```

If any check fails, regenerate `tasks.md` before continuing.

### Phase 3 — Per-resource authorization confirmation

For each aggregate in the inventory, **ask the user** which CRUD operations
the Resource should expose in Nova. The defaults below are not assumed — the
skill MUST prompt explicitly so the spec gets reflected in the generated
guards.

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

The answers map directly to the JSON contract of `generate-resource.mjs`:
`can_create`, `can_update`, `can_delete`. When any flag is `false`, the
generated Resource emits the corresponding `authorizedTo*` method returning
`false`. When all three are `true`, no overrides are emitted (Nova allows
everything by default).

Read-only / system-generated resources answer `n / n / n`. State-locked
resources (e.g. "editable only while Pending") answer `Y` here and get a
custom guard added in the customization pass — the prompt only sets the
hard-stop floor.

Do not proceed to generation until every aggregate has all three answers
recorded.

---

### Phase 4 — Generate Nova bundles

Generation is **always deterministic**. The skill normalizes each aggregate
into the JSON contract for each script, then spawns the wrapper agents in
parallel — one of each per aggregate root.

| Script | Template | Agent |
|--------|----------|-------|
| `scripts/generate-field-trait.mjs` | `templates/field-trait.php.tmpl` | field-trait-generator |
| `scripts/generate-resource.mjs` | `templates/resource.php.tmpl` | resource-generator |
| `scripts/generate-repeatable.mjs` | `templates/repeatable.php.tmpl` | repeatable-generator |

Ordering inside an aggregate's bundle: field-trait first (so the Resource and
Repeatable can consume it), then the Resource and Repeatable in parallel.
Aggregate bundles themselves run fully in parallel — there are no
cross-aggregate dependencies in this phase.

The JSON contract for each script lives in its header comment. The skill is
responsible for picking the right Nova field per column (`Text` / `Select` /
`BelongsTo` / `Boolean` / `Number` / `DateTime` …) and emitting the
`status_badge` map and `has_many_relationships` list — the script does not
look at the Eloquent model.

**Three invariants the JSON normalization must enforce** (the scripts assume
they hold):

- Every label that the user sees is provided in human form — the script wraps
  every label, `Tab::make`, `Badge::labels` entry, `Select::options` value
  label, and `->help()` text in `__()` automatically. The skill just supplies
  the strings.
- Foreign keys with real Eloquent relationships are emitted as
  `BelongsTo::make` fields. Logical cross-subdomain refs (no FK) become
  `Text::make(...)->help('Logical reference…')` instead — the skill decides
  per-column, the script renders whatever it's told.
- Resources with HasMany **must** have `has_many_relationships` populated —
  the script applies `Tab::group(...)` automatically when this list is
  non-empty. Skip it and you ship orphaned children in the UI.

### Phase 5 — Update plan.md

Append the Nova layer table to `plan.md` with the `Task ID` column tying each file back to its `tasks.md` entry.

---

## Resource Anatomy

Every Resource follows this exact structure, in this order:

```php
<?php

namespace [PackageNamespace]\Nova;

// imports

/**
 * @extends Resource<[ModelName]>
 */
class [ModelName] extends Resource
{
    // 1. Static properties
    public static $model = [ModelName]::class;
    public static $title = '[display_field]';
    public static $search = ['id', '[searchable_field]'];

    // 2. URI + labels
    public static function uriKey(): string
    public static function label(): string
    public static function singularLabel(): string

    // 3. Authorization overrides (only when needed)
    public static function authorizedToCreate(Request $request): bool
    public function authorizedToUpdate(Request $request): bool
    public function authorizedToDelete(Request $request): bool

    // 4. Fields
    public function fields(NovaRequest $request): array

    // 5. fieldsForCreate() — only when create/edit fields differ from display
    public function fieldsForCreate(): array

    // 6. Cards (metrics) — only when metrics exist
    public function cards(NovaRequest $request): array

    // 7. Actions — only when BPMN has logic tasks for this entity
    public function actions(NovaRequest $request): array
}
```

---

## Generation Rules

### Static properties

- `$model` — always the full class-string of the Eloquent model
- `$title` — the column that identifies the record in Nova UI (typically `name`, `subject`, `title`, or `id`)
- `$search` — only text columns meaningful for lookup (e.g. `name`, `subject`, `email`, `contact`). Never include `id` — ULIDs are not human-searchable

---

### URI + Labels

**MANDATORY — every Resource declares all three methods, with no exceptions.**
Nova's defaults pluralize the model class name in English; that breaks any
non-English deployment and hides the resource in localized menus. The
generator emits these three methods unconditionally — `uri_key`, `label`,
and `singular_label` are required inputs to the JSON contract.

Both labels go through `__()` so every locale resolves at request time. The
generator also seeds `lang/{locale}.json` with the label, the singular label,
the standard fixed labels (`Details`, `Status`, `Created At`, `Updated At`),
every status badge label, and every HasMany tab label — so a human translator
(or `laravel-lang/common lang:update`) has every key already present and can
replace the English placeholder with the target locale's translation.

```php
public static function uriKey(): string  { return '[plural-kebab-case]'; }
public static function label(): string   { return __('[Plural Label]'); }
public static function singularLabel(): string { return __('[Singular Label]'); }
```

---

### Authorization

Authorization has two layers:

1. **Hard floor — set per resource in Phase 3.** For every aggregate the skill
   asks the user `can create? / can update? / can delete?`. Any `no` answer
   emits the matching `authorizedTo*` returning `false`, baked into the
   generated Resource. This is the floor — a downstream policy cannot loosen
   it.

2. **State-conditional overrides — added in the customization pass.** When the
   spec restricts an operation only under specific states (e.g. "editable
   only while `Draft`"), the generator emits the `Y` answer (no method) and
   the customization pass adds a guard that inspects `$this->resource->status`.

Patterns:

```php
// Read-only resource
public static function authorizedToCreate(Request $request): bool { return false; }
public function authorizedToUpdate(Request $request): bool        { return false; }
public function authorizedToDelete(Request $request): bool        { return false; }

// State-locked (only editable while in a specific status)
public function authorizedToUpdate(Request $request): bool
{
    return $this->resource->status !== [StatusEnum]::[LockedState]
        && parent::authorizedToUpdate($request);
}
```

---

### Fields

**Layout:**
- **MANDATORY**: if the model has **any** `HasOne` or `HasMany` relationship, fields MUST be wrapped in `Tab::group()` with at least one `Tab::make(__('Details'), [...])` for own fields plus one `Tab::make(__('[Relation]'), [...])` per relationship. This is non-negotiable — no flat array when relationships exist.
- Use a flat `fields()` array ONLY for simple resources with zero HasOne/HasMany relationships.
- Use `Panel::make()->collapsible()->collapsedByDefault()` for optional/advanced settings inside a Tab.
- **Never expose `id` as a Nova field** — no `ID::make()`, no `Text::make('ID', 'id')`. ULIDs are not user-meaningful. Exception: if the `id` is a human-meaningful business identifier (e.g. ticket number, invoice number), expose it via its own column, never the primary `id`.

**Field selection per column type:**

| Column type | Nova field | Notes |
|-------------|------------|-------|
| `varchar` / `text` (short) | `Text::make()` | |
| `text` (long / rich) | `Trix::make()` or `Textarea::make()` | |
| `decimal` / `integer` | `Number::make()` | |
| `boolean` | `Boolean::make()` | |
| `timestamp` / `date` | `DateTime::make()` | Always `->displayUsing(fn ($v) => $v?->diffForHumans())->exceptOnForms()` |
| `enum` (status) | `Badge::make()` | Use `->map()` + `->labels()` with enum values |
| `enum` (other) | `Select::make()` | Use `->options()` built from enum cases |
| FK (belongs to) | `BelongsTo::make()` | **MANDATORY** for any `*_id` column. Add `->searchable()` for ULIDs. Never use `Text` or `Number` for a FK |
| Has one | `HasOne::make()` | Place inside a Tab (see Tabs rule below) |
| Has many | `HasMany::make()` | Place inside a Tab (see Tabs rule below) |
| JSON / array | `KeyValue::make()` | |
| Polymorphic | `MorphTo::make()` | **MANDATORY** for polymorphic FKs. Never use `Text` |

**Standard field modifiers:**
- `->rules(...)` — reference `Model::$validationRules['column']` with spread operator instead of duplicating inline: `->rules(...Model::$validationRules['col'])`
- `->sortable()` — on any column shown in the index that is sortable
- `->exceptOnForms()` — on `created_at`, `updated_at`, and computed/read-only fields
- `->hideFromIndex()` — on verbose fields (long text, advanced settings)
- `->filterable()` — on relationship fields, enum/status fields, and numeric fields
- `->help(__('...'))` — when the field purpose is not obvious from its label

**`created_at` / `updated_at` — always the same pattern:**
```php
DateTime::make(__('Created At'), 'created_at')
    ->displayUsing(fn ($value) => $value?->diffForHumans())
    ->exceptOnForms()
    ->sortable(),

DateTime::make(__('Updated At'), 'updated_at')
    ->displayUsing(fn ($value) => $value?->diffForHumans())
    ->exceptOnForms(),
```

**Badge for status fields — always use enum values:**
```php
Badge::make(__('Status'), 'status')
    ->map([
        [StatusEnum]::Active->value  => 'success',
        [StatusEnum]::Pending->value => 'warning',
        [StatusEnum]::Failed->value  => 'danger',
        [StatusEnum]::Closed->value  => 'info',
    ])
    ->labels([
        [StatusEnum]::Active->value  => __('Active'),
        [StatusEnum]::Pending->value => __('Pending'),
        [StatusEnum]::Failed->value  => __('Failed'),
        [StatusEnum]::Closed->value  => __('Closed'),
    ])
    ->sortable(),
```

Badge color convention: `success` = completed/active, `warning` = pending/draft,
`danger` = failed/error/cancelled, `info` = in-progress/neutral.

**`fieldsForCreate()` helper** — extract when:
- Create/edit form needs different fields than the detail/index view
- Advanced settings panel is collapsible
- Template fields or dynamic sections need separation

---

### Actions

- Only add an `actions()` method when the BPMN has `businessRuleTask` or `sendTask` nodes for this entity
- Each Action class lives in `src/Nova/Actions/`
- Actions are thin wrappers — they collect user input and call one Opscale Action
- Use `::make()` factory pattern — no constructor arguments

```php
public function actions(NovaRequest $request): array
{
    return [
        [ActionClass]::make(),
    ];
}
```

---

### Cards (Metrics)

- Only add a `cards()` method when metrics are defined for this resource
- Always use `->onlyOnDetail()` unless the metric belongs on the index
- Metric classes live in `src/Nova/Metrics/`

```php
public function cards(NovaRequest $request): array
{
    return [
        TotalRecords::make()->onlyOnDetail(),
        RecordsPerDay::make()->onlyOnDetail(),
        ByStatus::make()->onlyOnDetail(),
    ];
}
```

---

### Repeatables

When an aggregate owns child rows edited inline, use Nova Repeatables. The full pattern (when to use, generator wiring, the rendered shape) is in `references/repeatables.md`.

### Shared Fields — Avoiding Duplication

When a Resource and its Repeatables share a field set, extract a
`{ModelName}Fields` trait instead of redeclaring. The full pattern (trait shape,
when to apply it, generator wiring) is in `references/shared-fields.md`.

## Code Template

The authoritative templates now live on disk:

- `templates/resource.php.tmpl` — Nova Resource
- `templates/field-trait.php.tmpl` — shared `{ModelName}Fields` trait
- `templates/repeatable.php.tmpl` — Nova Repeatable

The JSON contract for each is documented at the top of the matching
`scripts/generate-*.mjs` file. The skill should never hand-write Resource PHP —
normalize the inputs into the JSON contract and let the script render the
`.tmpl`. To change rendered output, edit the `.tmpl` file, not the skill.

---

## Smoke gate (MANDATORY before marking the skill complete)

Resource templates that compile fine often fail at runtime — missing imports,
wrong namespace for a referenced HasMany child, `__()` on a non-string, enum
referenced before existing. The auto-reported checkboxes don't catch any of
this. Run these two checks; any failure means the skill is NOT done:

```bash
# 1. Every generated PHP file parses
find src/Nova -name '*.php' -print0 \
  | xargs -0 -n1 php -l > /dev/null \
  || { echo "❌ php -l failed"; exit 1; }

# 2. Every Resource class loads via reflection (catches missing imports,
#    bad namespaces, references to non-existent enums/models)
composer dump-autoload --no-scripts > /dev/null
php -r 'require "vendor/autoload.php";
  $bad = [];
  foreach (glob("src/Nova/*.php") as $f) {
    $class = "[PackageNamespace]\\\\Nova\\\\" . basename($f, ".php");
    try { new ReflectionClass($class); }
    catch (Throwable $e) { $bad[$class] = $e->getMessage(); }
  }
  if ($bad) { foreach ($bad as $c => $m) fwrite(STDERR, "$c: $m\n"); exit(1); }
  echo "OK ".count(glob("src/Nova/*.php"))." resources loaded\n";'

# 3. The workbench actually boots with Nova mounted (catches Resource
#    constructor errors, NovaServiceProvider issues, missing menu entries)
vendor/bin/testbench workbench:build --ansi > /dev/null
```

Do NOT mark the gate `PASS` based on file count or "Resources generated"
messages — reflection-load is the cheapest way to catch the bugs that hide
behind syntactically valid PHP.

---

## Domain Rules

1. **One aggregate = one bundle task in `tasks.md`** — Resource + Repeatable + Fields trait always ship together as a single tracked task. Never split into per-file tasks; never merge two aggregates into one task. spec-kit plan + tasks runs BEFORE any generator agent is spawned. Each Nova bundle task `depends_on` its corresponding `opscale-domain` bundle task.
2. **One Resource per aggregate root** — child entities shown via `HasMany` inside tabs do not get their own standalone Resource unless they appear independently in the sidebar.
3. **No business logic** — Nova Resources are pure UI. No calculations, no service calls, no Eloquent queries inline.
4. **All strings translatable — zero exceptions** — every user-visible string MUST be wrapped in `__()`. This includes: `label()`, `singularLabel()`, every Field label (first argument of `::make()`), every `Tab::make()` label, every `Tab::group()` label, every `Panel::make()` label, every Action display name, every `->help()` text, every `->options([...])` value label, every `->labels([...])` entry for Badge. Only technical identifiers (column names, uri keys, attribute names) stay untranslated.
5. **Never expose `id` as a Nova field** — no `ID::make()`, no `Text::make('ID', 'id')`. ULIDs are not user-meaningful. Exception: human-meaningful business identifiers (ticket number, invoice number) live in their own column, not `id`.
6. **Foreign keys MUST use relationship fields** — any column ending in `_id` or marked as `ref:` in the DBML MUST be exposed via `BelongsTo::make()` (or `MorphTo::make()` for polymorphic). Never `Text::make()` or `Number::make()` for a FK. Always add `->searchable()` since FKs are ULIDs.
7. **Tabs MANDATORY for HasOne/HasMany** — if the model has any `HasOne` or `HasMany` relationship, fields MUST be wrapped in `Tab::group()` with `Tab::make(__('Details'), [...])` for own fields plus one `Tab::make` per relationship. Flat `fields()` array is only allowed when the model has zero HasOne/HasMany.
8. **Badge for status** — status columns always use `Badge`, never `Select` or `Text`. Color convention: success/warning/danger/info.
9. **DateTime always diffForHumans** — `->displayUsing(fn ($v) => $v?->diffForHumans())->exceptOnForms()`.
10. **Authorization confirmed per resource** — for every aggregate the skill MUST ask `can create? / can update? / can delete?` in Phase 3 and pass the answers as `can_create` / `can_update` / `can_delete` to `generate-resource.mjs`. Any `no` emits the matching `authorizedTo*` returning `false`. State-conditional overrides (e.g. only editable while `Draft`) are added in the customization pass on top of the floor.
11. **`fieldsForCreate()` when needed** — extract create/edit fields when they differ from the display view, or when a collapsible advanced panel exists.
12. **Actions only from BPMN** — only add `actions()` when the BPMN has `businessRuleTask` or `sendTask` nodes for this entity. No speculative actions.
13. **`@extends Resource<Model>`** — always add the generic docblock for IDE type inference.
14. **Every aggregate = Resource + Repeatable + shared trait** — always generate all three files per aggregate root.
15. **Shared fields trait** — `Nova/Concerns/{ModelName}Fields.php` holds `coreFields()`. Both the Resource and Repeatable use it via `use {ModelName}Fields` — zero field duplication.
16. **Rules via `Model::$validationRules`** — never duplicate rules inline. Use spread: `->rules(...Model::$validationRules['col'])`.
17. **`uriKey()`, `label()`, `singularLabel()` MANDATORY on every Resource** — never rely on Nova's default English pluralization. The generator requires `uri_key`, `label`, and `singular_label` in the JSON contract and emits all three methods unconditionally.
18. **Lang file seeded automatically** — `generate-resource.mjs` and `generate-field-trait.mjs` append every user-visible string (resource label, singular label, field labels, status badge labels, HasMany tab labels, help texts, fixed labels like `Details` / `Status` / `Created At` / `Updated At`) to `lang/{locale}.json` as English placeholders. Existing keys are never overwritten. The skill does NOT hand-write translations — the generator does it.
