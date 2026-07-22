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

## After-create redirect for non-root aggregates

Every non-root aggregate resource (i.e., the child shown inside its root's
Tab) gets a `redirectAfterCreate()` method that returns the parent's
detail URL. When an operator creates a quota for an application, the
useful destination is the application — with the new quota visible in
its tab — not an orphan quota detail page.

```php
public static function redirectAfterCreate(NovaRequest $request, $resource): string
{
    return "/resources/{root_uri}/{$resource->{root_fk}}";
}
```

The generator emits this method on every Resource whose DBML entity is a
child of an aggregate root (detected via the `child_of` JSON field).
Aggregate roots themselves do not get one — the default index landing is
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
