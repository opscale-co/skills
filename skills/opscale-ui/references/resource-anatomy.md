# Resource anatomy — canonical structure

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
    public static $title = '[descriptive_field]';   // a business column — NEVER 'id'
    public static $search = ['[searchable_field]'];  // never 'id'

    // 2. URI + labels
    public static function uriKey(): string
    public static function label(): string
    public static function singularLabel(): string

    // 3. Authorization overrides (only when needed)
    public static function authorizedToCreate(Request $request): bool
    public function authorizedToUpdate(Request $request): bool
    public function authorizedToDelete(Request $request): bool

    // 4. fieldsForIndex() — curated, N+1-free subset for the index view
    public function fieldsForIndex(NovaRequest $request): array

    // 5. fields() — full set (detail + create + update); per-field hide/show
    //    handles view differences (no separate create/core method)
    public function fields(NovaRequest $request): array

    // 6. Cards (metrics) — only when metrics exist
    public function cards(NovaRequest $request): array

    // 7. Actions — every Action from src/Services/Actions/ that targets this
    //    entity, registered with its canSee guard (see Phase 5)
    public function actions(NovaRequest $request): array

    // 8. statusBadge() — private single-field helper, only when the entity
    //    has a status enum; called from both field methods
    private function statusBadge(): Badge
}
```

**Two field methods, never more.** Every Resource defines exactly
`fieldsForIndex()` (curated) and `fields()` (full). There is **no**
`fieldsForCreate()`, **no** `coreFields()`, and **no** shared `{ModelName}Fields`
trait — business fields are declared inline in `fields()`. Form-view
differences are expressed per field with Nova's hide/show modifiers
(`->onlyOnForms()`, `->hideWhenCreating()`, `->hideWhenUpdating()`,
`->exceptOnForms()`, `->hideFromIndex()`, `->onlyOnDetail()`). `fieldsForIndex()`
carries only the most-relevant, cheap-to-render columns — **never** a
`BelongsTo`/`HasMany`/`HasOne`/`MorphTo`/virtual-`Select` field, which would
resolve per row and cause N+1 on the index. See `references/fields-catalog.md`.

## Actions block — registered by opscale-ui (Phase 5)

`opscale-logic` produced the Action classes under `src/Services/Actions/`;
`opscale-ui` wires each one onto the Resource for the entity it operates on.
Each registration is `{Action}::make()` wrapped in the `canSee` guard matching
the Action's SIPOC precondition:

```php
public function actions(NovaRequest $request): array
{
    return [
        ApproveApplication::make()
            ->canSee(fn ($request) => $request->findModel()?->status?->is(ApplicationStatus::PendingReview)),
    ];
}
```

Single state → `->status?->is(...)`; multiple → `in_array(..., strict: true)`;
role → `$request->user()?->can('...')`; none → no `canSee`. Full catalogue in
`references/canSee-patterns.md`. Every Action registers on exactly one
Resource; `canSee` is a UI affordance, not security.

## After-create redirect for child entities

Every child-entity resource (an entity shown inside its parent's Tab) gets a
`redirectAfterCreate()` method that returns the parent's detail URL. When an
operator creates a quota for an application, the useful destination is the
application — with the new quota visible in its tab — not an orphan quota
detail page.

```php
public static function redirectAfterCreate(NovaRequest $request, $resource): string
{
    return "/resources/{root_uri}/{$resource->{root_fk}}";
}
```

The generator emits this method on every Resource whose DBML entity is a
child of a parent entity (detected via the `child_of` JSON field).
Root entities (no parent) do not get one — the default index landing is
correct for them.

## Authorization patterns

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
