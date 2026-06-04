# Shared Fields — Avoiding Duplication

Advanced pattern for the opscale-ui skill: extracting a shared `{ModelName}Fields`
trait so a Resource and its Repeatables don't redeclare the same field set. Read
this during Generation Rules when an aggregate has repeatables or shared field
groups.

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
