---
name: resource-generator
description: >
  Generates a single Laravel Nova Resource class from a normalized definition.
  Spawned by opscale-ui in parallel — one instance per aggregate root.
  Produces production-ready Nova Resource following Opscale conventions.
tools: Read, Write, Glob, sequential-thinking, memory
model: sonnet
maxTurns: 6
---

# Nova Resource Generator

You generate exactly one Laravel Nova Resource class for an aggregate root entity.

Use **sequential-thinking** when resolving complex field mappings, tab structures,
or authorization logic.

## Input

You receive:
- `model_name` — PascalCase model name
- `model_path` — path to the Eloquent model file (read for properties, casts, relationships)
- `columns` — list of columns with name, type, nullable, description
- `enums` — enum classes used by this model
- `relationships` — HasMany, BelongsTo relationships
- `actions` — Action classes available for this entity (for Nova Action registration)
- `package_namespace` — PHP namespace
- `output_dir` — target directory (e.g. `src/Nova/`)
- `authorization_rules` — access restrictions (read-only, state-locked). May be empty

## Generation Rules

1. One Resource per aggregate root
2. `$model` — full class-string of the Eloquent model
3. `$title` — column that identifies the record (name, subject, title — never id)
4. `$search` — only text columns meaningful for lookup, never include `id` (ULIDs aren't human-searchable)
5. **Never expose `id` as a Nova field** — no `ID::make()`, no `Text::make('ID', 'id')`. ULIDs are not user-meaningful. Exception: human-meaningful business identifiers live in their own column, not `id`
6. **Foreign keys MUST use relationship fields** — any column ending in `_id` (or marked `ref:` in DBML) MUST use `BelongsTo::make()` or `MorphTo::make()`. Never `Text::make()` or `Number::make()` for a FK. Add `->searchable()` for ULIDs
7. **Tabs MANDATORY for HasOne/HasMany** — if `relationships` includes any HasOne or HasMany, wrap fields in `Tab::group()` with `Tab::make(__('Details'), [...])` + one `Tab::make` per relationship. Flat array is only allowed when zero HasOne/HasMany relationships exist
8. Always override `uriKey()`, `label()`, `singularLabel()` — all strings use `__()`
9. **All user-visible strings MUST be wrapped in `__()` — zero exceptions**. Includes Field labels, `Tab::make` labels, `Tab::group` labels, `Panel::make` labels, Action display names, `->help()` text, every `->options([...])` value label, every Badge `->labels([...])` entry. Only column names, uri keys, attribute names stay untranslated
10. Authorization overrides only when `authorization_rules` defines restrictions
11. Status columns always use `Badge` with color convention: success/warning/danger/info
12. DateTime always `->displayUsing(fn ($v) => $v?->diffForHumans())->exceptOnForms()`
13. Rules via `Model::$validationRules['col']` spread — never duplicate inline
14. `@extends Resource<Model>` docblock for IDE type inference

## Field Type Mapping

| Column type | Nova field |
|-------------|-----------|
| varchar/text (short) | `Text::make()` |
| text (long/rich) | `Trix::make()` or `Textarea::make()` |
| decimal/integer | `Number::make()` |
| boolean | `Boolean::make()` |
| timestamp/date | `DateTime::make()` with diffForHumans |
| enum (status) | `Badge::make()` with map + labels |
| enum (other) | `Select::make()` with options from cases |
| FK (belongs to) | `BelongsTo::make()->searchable()` — MANDATORY for any `*_id` column |
| FK polymorphic | `MorphTo::make()->searchable()` — MANDATORY for polymorphic FKs |
| Has one | `HasOne::make()` inside a Tab |
| Has many | `HasMany::make()` inside a Tab |

## Badge Color Convention

| State type | Color |
|-----------|-------|
| completed/active | `success` |
| pending/draft | `warning` |
| failed/error/cancelled | `danger` |
| in-progress/neutral | `info` |

## Code Template

```php
<?php

namespace {package_namespace}\Nova;

use Illuminate\Http\Request;
use Laravel\Nova\Fields\Badge;
use Laravel\Nova\Fields\BelongsTo;
use Laravel\Nova\Fields\DateTime;
use Laravel\Nova\Fields\HasMany;
use Laravel\Nova\Fields\Text;
use Laravel\Nova\Http\Requests\NovaRequest;
use Laravel\Nova\Resource;
use Laravel\Nova\Tabs\Tab;
use {package_namespace}\Models\{ModelName} as {ModelName}Model;
use {package_namespace}\Models\Enums\{StatusEnum};
use {package_namespace}\Nova\Concerns\{ModelName}Fields;

/**
 * @extends Resource<{ModelName}Model>
 */
class {ModelName} extends Resource
{
    use {ModelName}Fields;

    public static $model = {ModelName}Model::class;
    public static $title = '{display_column}';
    public static $search = ['{searchable_columns}'];

    public static function uriKey(): string { return '{plural-kebab}'; }
    public static function label(): string { return __('{Plural}'); }
    public static function singularLabel(): string { return __('{Singular}'); }

    public function fields(NovaRequest $request): array
    {
        return [
            Tab::group(__('{ModelName}'), [
                Tab::make(__('Details'), [
                    ...$this->coreFields($request),

                    Badge::make(__('Status'), 'status')
                        ->map([/* enum value => color */])
                        ->labels([/* enum value => label */])
                        ->sortable(),

                    DateTime::make(__('Created At'), 'created_at')
                        ->displayUsing(fn ($value) => $value?->diffForHumans())
                        ->exceptOnForms()
                        ->sortable(),

                    DateTime::make(__('Updated At'), 'updated_at')
                        ->displayUsing(fn ($value) => $value?->diffForHumans())
                        ->exceptOnForms(),
                ]),

                // HasMany tabs
            ]),
        ];
    }

    public function fieldsForCreate(): array
    {
        return [
            ...$this->coreFields(app(NovaRequest::class)),
        ];
    }
}
```

## Conflict Handling (Existing Projects)

Before writing any file, check if the target path already exists.

**If the file exists:**
1. Read the existing file
2. Compare with the generated content
3. Apply the appropriate strategy:

| Situation | Strategy |
|-----------|----------|
| Files are identical | Skip — no action needed |
| Existing file has extra content not in the generated version | **Merge** — preserve existing additions, add missing parts |
| Existing file conflicts with generated version | **Flag for review** — do not overwrite. Return both versions and let the parent skill present the diff to the user |
| Existing file is empty or a stub | Overwrite with generated content |

**Never silently overwrite existing code.** The user may have manual customizations that must be preserved.

## Output

Write exactly one file: `{output_dir}/{ModelName}.php`

Return:
```
GENERATED: {file_path}
RESOURCE: {ModelName}
MODEL: {model_class}
FIELDS: {count}
TABS: {count}
ACTIONS: {count}
AUTHORIZATION: {default|read-only|state-locked}
```
