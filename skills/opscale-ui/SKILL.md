---
name: opscale-ui
description: >
  Generates complete, production-ready Laravel Nova Resource classes from a validated
  Opscale DBML and BPMN. Produces one Resource per aggregate root, following real
  Opscale Nova conventions. Use this skill whenever domain classes exist and the next
  step is to expose them in the Nova admin panel. This is Step 5 in the Opscale
  sequence — runs AFTER opscale-domain and BEFORE opscale-logic. Also trigger when
  the user says "generate the Nova resource", "create the admin panel", "build the
  UI layer", or "expose the model in Nova". Nova is the Interaction layer — zero
  business logic lives here.
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

### Phase 3 — Spawn resource generators

For each bundle task in `tasks.md`, spawn `resource-generator`, `repeatable-generator`,
and `field-trait-generator` agents in parallel. One agent set per aggregate.

### Phase 4 — Update plan.md

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

Always override these three methods. Use `__()` for all strings — everything is translatable:

```php
public static function uriKey(): string  { return '[plural-kebab-case]'; }
public static function label(): string   { return __('[Plural Label]'); }
public static function singularLabel(): string { return __('[Singular Label]'); }
```

---

### Authorization

Only override when the spec or business rules impose restrictions.
Common patterns from the spec:

- Read-only resource (e.g. system-generated records): override all three to `return false`
- State-locked resource (e.g. cannot edit after published): check `$this->resource->status`

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

Use `Repeatable` classes when an aggregate root contains a typed nested collection
(e.g. channels, line items, contact methods) that is always managed through the parent.

**When to create a Repeatable:**
- The aggregate has a one-to-many relationship to a value-like child entity
- The child is never shown standalone in the Nova sidebar
- The data is best captured as a structured list in the parent's form

**Rules:**
- Lives in `src/Nova/Repeatables/`
- Extends `Laravel\Nova\Fields\Repeater\Repeatable`
- Only a `fields(NovaRequest $request): array` method — no authorization overrides
- Rules use `[ParentModel]::$validationRules['column']` via spread operator
- All strings wrapped in `__()`

**Repeatable template:**

```php
<?php

namespace [PackageNamespace]\Nova\Repeatables;

use Laravel\Nova\Fields\Boolean;
use Laravel\Nova\Fields\Number;
use Laravel\Nova\Fields\Repeater\Repeatable;
use Laravel\Nova\Fields\Select;
use Laravel\Nova\Fields\Text;
use Laravel\Nova\Http\Requests\NovaRequest;
use [PackageNamespace]\Models\[ParentModel];

class [RepeatableName] extends Repeatable
{
    /**
     * Get the fields displayed by the repeatable.
     *
     * @return array<mixed>
     */
    public function fields(NovaRequest $request): array
    {
        return [
            Select::make(__('[Type Label]'), '[type_column]')
                ->options([
                    '[value]' => __('[Label]'),
                ])
                ->rules(...[ParentModel]::$validationRules['[type_column]']),

            Text::make(__('[Text Label]'), '[text_column]')
                ->rules(...[ParentModel]::$validationRules['[text_column]'])
                ->help(__('[Format or purpose description]')),

            Boolean::make(__('[Bool Label]'), '[bool_column]')
                ->default(false),

            Number::make(__('[Number Label]'), '[number_column]')
                ->min([min])
                ->max([max])
                ->default([default])
                ->rules(...[ParentModel]::$validationRules['[number_column]'])
                ->help(__('[Helper text]'))
                ->filterable(),
        ];
    }
}
```

**Using a Repeatable inside a Resource:**

```php
use Laravel\Nova\Fields\Repeater;
use [PackageNamespace]\Nova\Repeatables\[RepeatableName];

// Inside fields() or fieldsForCreate():
Repeater::make(__('[Collection Label]'), '[column_or_relation]')
    ->repeatables([
        [RepeatableName]::make(),
    ])
    ->rules('nullable', 'array'),
```


---

### Shared Fields — Avoiding Duplication

Every aggregate generates three Nova files:
1. `Nova/{ModelName}.php` — the Resource
2. `Nova/Repeatables/{ModelName}.php` — the Repeatable
3. `Nova/Concerns/{ModelName}Fields.php` — the shared fields trait

The trait holds the field definitions once. Both the Resource and the Repeatable
use it via `use {ModelName}Fields`.

**Why a trait instead of a base class:**
- Resource extends `Laravel\Nova\Resource`
- Repeatable extends `Laravel\Nova\Fields\Repeater\Repeatable`
- They share no common base — a trait is the only clean sharing mechanism

**Shared fields trait template:**

```php
<?php

namespace [PackageNamespace]\Nova\Concerns;

use Laravel\Nova\Fields\Boolean;
use Laravel\Nova\Fields\DateTime;
use Laravel\Nova\Fields\Number;
use Laravel\Nova\Fields\Select;
use Laravel\Nova\Fields\Text;
use Laravel\Nova\Http\Requests\NovaRequest;
use [PackageNamespace]\Models\[ModelName] as [ModelName]Model;

trait [ModelName]Fields
{
    /**
     * The core fields shared between Resource and Repeatable.
     *
     * @return array<mixed>
     */
    protected function coreFields(NovaRequest $request): array
    {
        return [
            Text::make(__('[Label]'), '[column]')
                ->rules(...[ModelName]Model::$validationRules['[column]'])
                ->sortable(),

            Select::make(__('[Label]'), '[type_column]')
                ->options(
                    collect([EnumClass]::cases())
                        ->mapWithKeys(fn ($case) => [$case->value => __($case->name)])
                        ->all()
                )
                ->rules(...[ModelName]Model::$validationRules['[type_column]'])
                ->displayUsingLabels()
                ->filterable(),

            Boolean::make(__('[Label]'), '[bool_column]')
                ->default(false),

            Number::make(__('[Label]'), '[number_column]')
                ->min([min])
                ->max([max])
                ->default([default])
                ->rules(...[ModelName]Model::$validationRules['[number_column]'])
                ->filterable(),
        ];
    }
}
```

**Resource consuming the trait:**

```php
use [PackageNamespace]\Nova\Concerns\[ModelName]Fields;

class [ModelName] extends Resource
{
    use [ModelName]Fields;

    public function fieldsForCreate(): array
    {
        return [
            ...$this->coreFields(app(NovaRequest::class)),
            // Resource-only fields (timestamps, badges, HasMany) added here
        ];
    }
}
```

**Repeatable consuming the same trait:**

```php
use [PackageNamespace]\Nova\Concerns\[ModelName]Fields;

class [ModelName] extends Repeatable
{
    use [ModelName]Fields;

    public function fields(NovaRequest $request): array
    {
        return $this->coreFields($request);
        // Repeatables rarely need extra fields beyond coreFields
    }
}
```

**What goes in `coreFields()` vs. Resource-only:**

| Shared (`coreFields`) | Resource-only |
|-----------------------|---------------|
| Business input fields (text, select, boolean, number) | `Badge` (status display) |
| Relationship fields (`BelongsTo`) | `HasMany` tabs |
| Rules, sortable, filterable | `DateTime` (created_at, updated_at) |
| | Authorization logic |
| | Metrics / cards |
| | Actions |


---

## Code Template

```php
<?php

namespace [PackageNamespace]\Nova;

use Illuminate\Http\Request;
use Laravel\Nova\Fields\Badge;
use Laravel\Nova\Fields\BelongsTo;
use Laravel\Nova\Fields\DateTime;
use Laravel\Nova\Fields\HasMany;
use Laravel\Nova\Fields\Select;
use Laravel\Nova\Fields\Text;
use Laravel\Nova\Http\Requests\NovaRequest;
use Laravel\Nova\Resource;
use Laravel\Nova\Tabs\Tab;
use [PackageNamespace]\Models\[ModelName] as [ModelName]Model;
use [PackageNamespace]\Models\Enums\[StatusEnum];

/**
 * @extends Resource<[ModelName]Model>
 */
class [ModelName] extends Resource
{
    /**
     * The model the resource corresponds to.
     *
     * @var class-string<[ModelName]Model>
     */
    public static $model = [ModelName]Model::class;

    /**
     * The field used to represent the resource in the UI.
     *
     * @var string
     */
    public static $title = '[display_column]';

    /**
     * The columns that should be searched.
     *
     * @var array<string>
     */
    public static $search = [
        '[text_column_1]',
        '[text_column_2]',
    ];

    public static function uriKey(): string
    {
        return '[plural-kebab-case]';
    }

    public static function label(): string
    {
        return __('[Plural Label]');
    }

    public static function singularLabel(): string
    {
        return __('[Singular Label]');
    }

    // --- Authorization (only when spec requires restrictions) ---

    // public static function authorizedToCreate(Request $request): bool { return false; }
    // public function authorizedToUpdate(Request $request): bool        { return false; }
    // public function authorizedToDelete(Request $request): bool        { return false; }

    /**
     * Get the fields displayed by the resource.
     *
     * @return array<mixed>
     */
    public function fields(NovaRequest $request): array
    {
        return [
            // Use Tab::group() when HasMany relationships exist
            Tab::group(__('[ModelName]'), [

                Tab::make(__('Details'), [
                    ...$this->fieldsForCreate(),

                    Badge::make(__('Status'), 'status')
                        ->map([
                            [StatusEnum]::Pending->value => 'warning',
                            [StatusEnum]::Active->value  => 'success',
                            [StatusEnum]::Closed->value  => 'info',
                        ])
                        ->labels([
                            [StatusEnum]::Pending->value => __('Pending'),
                            [StatusEnum]::Active->value  => __('Active'),
                            [StatusEnum]::Closed->value  => __('Closed'),
                        ])
                        ->sortable(),

                    DateTime::make(__('Created At'), 'created_at')
                        ->displayUsing(fn ($value) => $value?->diffForHumans())
                        ->exceptOnForms()
                        ->sortable(),

                    DateTime::make(__('Updated At'), 'updated_at')
                        ->displayUsing(fn ($value) => $value?->diffForHumans())
                        ->exceptOnForms(),
                ]),

                Tab::make(__('[Related]'), [
                    HasMany::make(__('[Related]'), '[relation]', [RelatedResource]::class),
                ]),
            ]),
        ];
    }

    /**
     * Fields used on create and edit forms.
     * Separated so Badge and read-only fields are not shown on forms.
     *
     * @return array<mixed>
     */
    public function fieldsForCreate(): array
    {
        return [
            BelongsTo::make(__('[Parent]'), '[relation]', [ParentResource]::class)
                ->searchable()
                ->required(),

            Text::make(__('[Column]'), '[column]')
                ->rules(...[ModelName]Model::$validationRules['[column]'])
                ->sortable(),

            Select::make(__('[Type]'), '[type_column]')
                ->options(
                    collect([EnumClass]::cases())
                        ->mapWithKeys(fn ($case) => [$case->value => __($case->name)])
                        ->all()
                )
                ->rules('required')
                ->displayUsingLabels()
                ->hideFromIndex(),
        ];
    }

    // --- Actions (only when BPMN has logic/output tasks for this entity) ---

    // public function actions(NovaRequest $request): array
    // {
    //     return [
    //         [ActionClass]::make(),
    //     ];
    // }

    // --- Cards/Metrics (only when metrics are defined) ---

    // public function cards(NovaRequest $request): array
    // {
    //     return [
    //         [MetricClass]::make()->onlyOnDetail(),
    //     ];
    // }
}
```

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
10. **Authorization from spec** — only override `authorizedTo*` when the spec defines restrictions (read-only records, state-locked editing).
11. **`fieldsForCreate()` when needed** — extract create/edit fields when they differ from the display view, or when a collapsible advanced panel exists.
12. **Actions only from BPMN** — only add `actions()` when the BPMN has `businessRuleTask` or `sendTask` nodes for this entity. No speculative actions.
13. **`@extends Resource<Model>`** — always add the generic docblock for IDE type inference.
14. **Every aggregate = Resource + Repeatable + shared trait** — always generate all three files per aggregate root.
15. **Shared fields trait** — `Nova/Concerns/{ModelName}Fields.php` holds `coreFields()`. Both the Resource and Repeatable use it via `use {ModelName}Fields` — zero field duplication.
16. **Rules via `Model::$validationRules`** — never duplicate rules inline. Use spread: `->rules(...Model::$validationRules['col'])`.
