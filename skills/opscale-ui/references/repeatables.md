# Repeatables

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
