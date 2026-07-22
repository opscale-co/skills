# Cross-subdomain virtual relations — code templates

When `final/external-refs.md` carries an `external-refs` index, the domain
layer emits two extra artifacts and wires every cross-subdomain column into a
real `BelongsTo` resolved through a host-supplied contract — instead of a
dangling comment.

## `src/Models/Concerns/HasContractRelations.php` — generated once if there is ≥1 external-ref slug

```php
<?php

declare(strict_types=1);

namespace {Package\Namespace}\Models\Concerns;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

trait HasContractRelations
{
    /**
     * Define a BelongsTo against the Eloquent query builder supplied
     * by the given contract. The related model class comes from
     * whatever model the host bound to that contract.
     *
     * @param  class-string  $contract  Contract whose query() returns the host's Eloquent\Builder
     */
    protected function belongsToContract(string $contract, string $foreignKey, string $relation): BelongsTo
    {
        $query = app($contract)->query();
        $related = $query->getModel();

        return $this->newBelongsTo(
            $query,
            $this,
            $foreignKey,
            $related->getKeyName(),
            $relation,
        );
    }
}
```

## `src/Contracts/{ContractName}Contract.php` — one per slug in the `external-refs` index

```php
<?php

declare(strict_types=1);

namespace {Package\Namespace}\Contracts;

use Illuminate\Database\Eloquent\Builder;

interface {ContractName}Contract
{
    public function query(): Builder;

    /**
     * @return array<string, string> Associative array of id to user-friendly description.
     */
    public function options(): array;
}
```

Naming: `users` → `UsersContract`, `agencies` → `AgenciesContract`
(StudlyCase + `Contract` suffix).

The host is responsible for binding an implementation. Domain does NOT
register any default binding — that's the host's concern, not the package's.

## Relation method naming convention

For each cross-subdomain column the model emits a virtual `BelongsTo` method:

| Column shape | Relation method | Example |
|--------------|-----------------|---------|
| `agency_id`, `teller_id`, `witness_id` | strip `_id`, camelCase | `agency_id → agency` |
| `*_witness_id` (qualified witness) | camelCase the qualified prefix | `opening_witness_id → openingWitness` |
| `*_by` (actor / audit columns) | camelCase + `User` suffix | `opened_by → openedByUser` |

These rules live in `scripts/generate-model.mjs` — extend them there if a new
shape shows up.
