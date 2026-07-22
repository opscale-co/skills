# Virtual (cross-subdomain) relations — pattern reference

Logical refs across subdomains (no foreign-key constraint, resolved via a
`*Contract` defined by `opscale-domain`) are rendered as a real Nova
`Select` — never `Text::make(...)->help('Logical reference…')`.

Text fields force operators to memorize ULIDs, hide the relation from
filters, and silently accept invalid references. A Select with
`searchable()` + `filterable()` becomes a usable lookup AND a real filter
on the index.

## Field shape

```php
use Laravel\Nova\Fields\Select;
use Acme\Credits\Contracts\CounterpartyContract;

Select::make(__('Counterparty'), 'counterparty_id')
    ->options(fn () => app(CounterpartyContract::class)->forSelect())
    ->searchable()
    ->filterable()
    ->displayUsingLabels(),
```

- `options(fn () => ...)` is a closure so the option list is loaded only
  when the field is actually rendered (avoids N+1 across an index page
  full of rows).
- `searchable()` turns the select into a typeahead — critical when the
  option list is large.
- `filterable()` exposes the field as a real filter on the index.
- `displayUsingLabels()` renders the label (not the id) on detail/index.

## Contract extension

The cross-subdomain contract introduced by `opscale-domain` already
declares `query()`. For the Select pattern it MUST also expose
`forSelect()`:

```php
<?php

declare(strict_types=1);

namespace Acme\Credits\Contracts;

use Illuminate\Database\Eloquent\Builder;

interface CounterpartyContract
{
    public function query(): Builder;

    /**
     * @return array<string, string> [id => label]
     */
    public function options(): array;

    /**
     * @return array<string, string> [id => label] — same shape as options(),
     * but specifically intended for Nova Select fields. The host implementation
     * is free to return a curated subset (e.g. active only) or the full set.
     */
    public function forSelect(): array;
}
```

`options()` already existed (from `opscale-domain`). `forSelect()` is new
and exists so the host can return a curated, ordered, ready-for-UI subset
without disturbing the canonical `options()` contract that other consumers
may already use.

## Host implementation example

```php
final class EloquentCounterparty implements CounterpartyContract
{
    public function query(): Builder
    {
        return Counterparty::query();
    }

    public function options(): array
    {
        return $this->query()->pluck('display_name', 'id')->all();
    }

    public function forSelect(): array
    {
        return $this->query()
            ->where('is_active', true)
            ->orderBy('display_name')
            ->pluck('display_name', 'id')
            ->all();
    }
}
```

## JSON contract additions for the generator

For each entry in `fields[]`, signal a virtual relation with:

```json
{
  "field":         "VirtualSelect",
  "label":         "Counterparty",
  "label_es":      "Contraparte",
  "attribute":     "counterparty_id",
  "contract_class": "CounterpartyContract",
  "modifiers":     ["searchable", "filterable", "displayUsingLabels"]
}
```

The generator imports `Select` + the contract, emits the closure-based
`->options(fn () => app({Contract}::class)->forSelect())`, and seeds the
EN + ES label into both lang files.

The legacy `Text::make(...)->help('Logical reference…')` pattern is no
longer accepted output.
