# Fields catalog — type mapping, modifiers, common patterns

## Layout rules

- **MANDATORY**: if the model has **any** `HasOne` or `HasMany` relationship, fields MUST be wrapped in `Tab::group()` with at least one `Tab::make(__('Details'), [...])` for own fields plus one `Tab::make(__('[Relation]'), [...])` per relationship. See `aggregate-tabs.md` for the visibility-guard pattern. This is non-negotiable — no flat array when relationships exist.
- Use a flat `fields()` array ONLY for simple resources with zero HasOne/HasMany relationships.
- Use `Panel::make()->collapsible()->collapsedByDefault()` for optional/advanced settings inside a Tab.
- **Never expose `id` as a Nova field** — no `ID::make()`, no `Text::make('ID', 'id')`. ULIDs are not user-meaningful. Exception: if the `id` is a human-meaningful business identifier (e.g. ticket number, invoice number), expose it via its own column, never the primary `id`.

## Field selection per column type

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

## Standard field modifiers

- `->rules(...)` — reference `Model::$validationRules['column']` with spread operator instead of duplicating inline: `->rules(...Model::$validationRules['col'])`
- `->sortable()` — on any column shown in the index that is sortable
- `->exceptOnForms()` — on `created_at`, `updated_at`, and computed/read-only fields
- `->hideFromIndex()` — on verbose fields (long text, advanced settings)
- `->filterable()` — on relationship fields, enum/status fields, and numeric fields
- `->help(__('...'))` — when the field purpose is not obvious from its label

## `created_at` / `updated_at` — always the same pattern

```php
DateTime::make(__('Created At'), 'created_at')
    ->displayUsing(fn ($value) => $value?->diffForHumans())
    ->exceptOnForms()
    ->sortable(),

DateTime::make(__('Updated At'), 'updated_at')
    ->displayUsing(fn ($value) => $value?->diffForHumans())
    ->exceptOnForms(),
```

## Badge for status fields — always use enum values

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

## Two field methods — `fields()` + `fieldsForIndex()`

Every Resource defines exactly two field methods. There is **no**
`fieldsForCreate()`, **no** `coreFields()`, and **no** shared field trait.

### `fields()` — the full set (detail + create + update)

All business fields declared inline, plus the status `Badge` and
`created_at`/`updated_at`. When the model has any `HasOne`/`HasMany`, wrap in
`Tab::group()` (see Layout rules). View differences are handled **per field**
with hide/show modifiers — never by splitting into another method:

| Modifier | Effect |
|----------|--------|
| `->onlyOnForms()` | create + update only |
| `->hideWhenCreating()` | hidden on the create form |
| `->hideWhenUpdating()` | hidden on the update form |
| `->showOnCreating()` / `->showOnUpdating()` | force-show on that form |
| `->exceptOnForms()` | detail + index, never on forms (timestamps, computed) |
| `->hideFromIndex()` | present everywhere except the index (verbose text) |
| `->onlyOnDetail()` | detail page only |

### `fieldsForIndex()` — curated, N+1-free subset

Only the **most-relevant, cheap-to-render** columns — enough to identify and
scan a row, nothing more. Curation rules:

- Include the title/business-identifier column, the status `Badge`, and usually
  `created_at`. Add at most a couple of other scalar columns operators scan by.
- Mark index fields `->sortable()`.
- **Never** include a relationship field (`BelongsTo`, `HasMany`, `HasOne`,
  `MorphTo`, virtual `Select`) — Nova resolves each row's relation and the
  index degrades to N+1. Relationship fields belong in `fields()` only.
- Do not restate every field from `fields()`. A small amount of duplication
  between the two methods is expected and preferred over a shared helper.

## Virtual relations — Select with options/searchable/filterable

```php
Select::make(__('Counterparty'), 'counterparty_id')
    ->options(fn () => app(CounterpartyRepository::class)->forSelect())
    ->searchable()
    ->filterable()
    ->displayUsingLabels(),
```

The foreign repository contract MUST expose `forSelect(): array`
returning `[id => label]`. See `virtual-relations.md` for the full pattern.
