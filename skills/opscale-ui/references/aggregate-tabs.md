# Relation tabs on every Resource — pattern reference

**Every entity now has its own Resource** (one Resource per DBML entity). Each
Resource renders its own `has-many` / `has-one` relations as `Tab::make(...)`
inside its `fields()` via `Tab::group(...)`. This is no longer a root-only
concern: navigation works from any entity to the records related to it, in
both directions.

Each relation tab shows the related records via a `HasMany`/`HasOne` field
pointing at the **related entity's own Resource** (which always exists now).
Whether a Resource also appears in the sidebar is decided later by
`opscale-showcase` (menu phase) — this skill emits a Resource + relation tabs
for every entity regardless.

## Visibility rule

| Relation kind | Tab visibility |
|------------|----------------|
| Creatable from UI (operator can add the first related row via Nova) | ALWAYS visible — operator needs the entry point to add the first row |
| System-only (created exclusively by Actions or system events)  | HIDDEN when count = 0 — an empty tab the operator can't populate is noise |

Detection rule for the skill: a relation is "creatable from UI" when the
related entity's Resource has `can_create = true` (set in Phase 3 per-resource
authorization). Otherwise it is system-only.

`has-one` relations follow the same rule and render as a `HasOne::make(...)
->onlyOnDetail()` field inside their own tab.

## Counts MUST go through Nova, not the Model

Place `withCount`-style loads on the **Resource**, never on the Eloquent
model.

```php
// In src/Nova/Application.php — CORRECT
public static $with = ['quotas'];

// or, to load counts only when the Resource is queried via Nova:
public static function indexQuery(NovaRequest $request, $query)
{
    return $query->withCount('quotas');
}
```

```php
// In src/Models/Application.php — WRONG
protected $withCount = ['quotas']; // runs on EVERY query — jobs, reports, API, exports
```

Model-level `withCount` is the canonical source of N+1 on index pages and
spills into every query the model is involved in (jobs, reports, exports).

## Canonical Resource shape

```php
use Laravel\Nova\Fields\HasMany;
use Laravel\Nova\Fields\Tab;
use Laravel\Nova\Http\Requests\NovaRequest;

class Application extends Resource
{
    public static $model = \Acme\Credits\Models\Application::class;

    public static $with = ['quotas'];

    public function fields(NovaRequest $request): array
    {
        return [
            Tab::group(default: __('Details'), tabs: array_filter([
                Tab::make(__('Details'), [
                    // own fields …
                ]),

                // Creatable child → always visible.
                Tab::make(__('Quotas'), [
                    HasMany::make(__('Quotas'), 'quotas', Quota::class),
                ]),

                // System-only child → left out of the group while it has no rows.
                $this->resource->auditEntries()->exists() ? Tab::make(__('Audit entries'), [
                    HasMany::make(__('Audit entries'), 'auditEntries', AuditEntry::class),
                ]) : null,
            ])),
        ];
    }
}
```

Nova 5's `Tab` has **no** `canSee()` — calling it throws "Call to undefined method
Laravel\Nova\Tabs\Tab::canSee()" and the detail page fails to load. A system-only tab
is therefore added only when the relation has rows, and the group is wrapped in
`array_filter([...])` to drop the `null`. The check is a direct `exists()` query because
the `{relation}_count` column that `withCount` adds is only loaded on the index.

## JSON contract additions for the generator

For each entry in `has_many_relationships`:

```json
{
  "name": "quotes",
  "label": "ventas.opportunity.tab.quotes",
  "label_en": "Quotes",
  "label_es": "Propuestas",
  "related_resource": "Quote",
  "creatable_from_ui": true,
  "count_column": "quotes_count"
}
```

`label` is the i18n KEY the template wraps in `__()`; `label_en`/`label_es` are
the values seeded into the lang files. `creatable_from_ui` is derived by
`resource-tabs-generator` from the CHILD entity's `permissions.create` (any value
other than `"false"` ⇒ creatable, tab always visible; `"false"` ⇒ system-only,
count-gated). Legacy callers may omit `label` and pass only `label_en`/`label_es`
— the English string then doubles as the key.

When `creatable_from_ui` is `false`, the generator emits the tab as
`$this->resource->{name}()->exists() ? Tab::make(...) : null` and wraps the group in
`array_filter([...])`. Otherwise the tab is emitted unconditionally.

The generator also adds the relation to `public static $with = [...]` (or
`indexQuery()` withCount, configurable via `count_strategy` in the JSON).

`has_one_relationships` uses the same entry shape and is rendered identically,
except the field is `HasOne::make(...)->onlyOnDetail()` instead of
`HasMany::make(...)`. (If `has_one_relationships` is not yet wired in the
generator, mirror the `has_many_relationships` handling — see the TODO in
`SKILL.md` Phase 4.)
