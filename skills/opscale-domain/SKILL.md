---
name: opscale-domain
description: >
  Generates complete, production-ready PHP domain classes from a validated Opscale
  DBML data model. Produces migrations, Eloquent models, PHP 8.3 backed enums,
  repository interfaces and implementations, and value objects with Laravel casts.
  Use this skill whenever data-model.md exists and the next step is to generate
  the domain layer code. This is Step 4 in the Opscale sequence — runs AFTER
  opscale-bpmn and BEFORE opscale-ui. Also trigger when the user says "generate
  the domain", "create the models", "generate migrations", or "build the domain layer".
  All code is derived strictly from the DBML — nothing is invented.
---

# opscale-domain

## Purpose

Transform the validated DBML into a complete PHP domain layer. Every class generated
maps 1:1 to an element in `data-model.md`. Nothing is created that cannot be traced
back to the DBML.

Output files are written to the package source directory and listed in
`.specify/specs/{NNN}-{module-name}/plan.md` (domain section).

---

## Input Requirements

Before starting, verify:
- `.specify/specs/{NNN}-{module-name}/data-model.md` exists and passed completeness gate
- `.specify/specs/{NNN}-{module-name}/spec.md` exists (for business rule context in repositories)
- Constitution `TENANT_AWARE` value is known

If inputs are missing, stop and tell the user which skill to run first.

---

## Output: File Structure

```
src/
├── Database/
│   └── Migrations/
│       └── YYYY_MM_DD_HHMMSS_create_{table}_table.php   (one per table)
├── Models/
│   ├── Enums/
│   │   └── {EnumName}.php                               (one per DBML enum)
│   ├── Repositories/
│   │   └── {ModelName}Repository.php                    (trait — one per model)
│   ├── ValueObjects/
│   │   └── {ValueObjectName}.php                        (one per VO)
│   └── {ModelName}.php                                  (one per table)
```

---

## Generation Rules

### Migrations

- One migration per DBML table — filename: `YYYY_MM_DD_HHMMSS_create_{table}_table.php`
- Increment timestamp by 1 second per file to enforce dependency order
- `id` → `$table->ulid('id')->primary()`
- `tenant_id` → `$table->ulid('tenant_id')->index()` (only if TENANT_AWARE)
- Enum columns → `$table->string('{col}')->default('{default}')`
- Timestamps → `$table->timestamps()`
- Soft deletes → `$table->softDeletes()` only if `deleted_at` in DBML
- Intra-subdomain FK → `$table->foreign('{col}')->references('id')->on('{table}')->cascadeOnDelete()`
- Cross-subdomain reference → `$table->ulid('{col}')` + comment: `// logical reference to {subdomain}.{table} — no FK constraint`
- DBML indexes → `$table->index(['{col}'])` or composite `$table->index(['{col1}', '{col2}'])`

### Eloquent Models

- `@property` docblock for every column — type must be `string` for ULIDs (not `int`)
- Use `Validatable` from `opscale/validations` and declare `public static $validationRules` with Laravel validation rules per column
- Use `{ModelName}Repository` trait (the repository trait for this model)
- `protected $table` — only when the table name differs from Laravel's convention (plural snake_case of class name)
- Use `HasUlids` trait — handles PK type and ULID generation automatically
- `protected $fillable` — all business columns except `id`, timestamps, `deleted_at`
- `protected $casts` — enum columns → Enum class; VO columns → Cast class; dates → `'datetime'`
- Relationships only for intra-subdomain FKs — `belongsTo()`, `hasMany()`, `belongsToMany()`
- Cross-subdomain columns → comment: no Eloquent relationship, query via target repo
- `SoftDeletes` trait only if `deleted_at` in DBML
- No business logic in models — only property definitions, casts, relationships, validation rules
- `declare(strict_types=1)` in every file

### Enums

- `enum {Name}: string` (PHP 8.3 backed)
- Case name: PascalCase — value: **Title Case** string matching the DBML value exactly (e.g. `case InProgress = 'In Progress'`)
- Every case must have a docblock comment explaining its business meaning (what it means for the entity to be in this state)
- When the enum is a **status** field (column named `status`), add `canTransitionTo(self $status): bool` — inline `match()` returning bool per state
- Docblock describing the business concept

### Repositories

Repository is a **trait**, not a class or interface. It is mixed into the Eloquent Model.

- Named `{ModelName}Repository` — used as `use {ModelName}Repository;` inside the model
- Contains a `boot{ModelName}Repository()` static method for model event hooks (e.g. status transition validation on `updating`)
- Contains Eloquent **scope methods** for all domain-specific queries (e.g. `scopeOpen`, `scopeActive`, `scopeOverdue`, `scopeForAssignee`)
- Scope methods receive a `Builder $query` and return `Builder`
- If the model has a `status` column, the boot method validates the transition on `updating` using `canTransitionTo()`
- If TENANT_AWARE, scopes always receive `string $tenantId` and apply `->where('tenant_id', $tenantId)`
- No `findById`, `create`, `update`, `delete` — those are standard Eloquent on the model itself

### Value Objects

- `readonly class` (PHP 8.3+)
- Implements `Illuminate\Contracts\Database\Eloquent\CastsAttributes`
- Constructor validates inputs — throws `\InvalidArgumentException` on invalid data
- `get()` reconstructs the VO from stored column value(s)
- `set()` returns scalar value(s) to store
- Immutable — no setters, no mutators

---

## Workflow

### Phase 1 — Inventory

Read `data-model.md` and present the full generation plan:

```
Domain inventory for [Module Name]:

Enums (generated first):
  - [EnumName]: [value1, value2, ...]

Value Objects:
  - [VOName]: columns [col1, col2]

Migrations + Models (in dependency order):
  1. [table_a] → [ModelA]  (no FK dependencies)
  2. [table_b] → [ModelB]  (depends on table_a)

Repository traits (mixed into their model):
  - [ModelA]Repository (trait → used in [ModelA])
  - [ModelB]Repository (trait → used in [ModelB])

Confirm before generating?
```

Wait for confirmation.

---

### Phase 2 — Generate Enums

Generate all enum PHP files completely.
Enums must exist before models reference them in `$casts`.

---

### Phase 3 — Generate Value Objects

Generate all VO PHP files completely.

---

### Phase 4 — Generate Migrations

Generate migration files in dependency order (parents before children).

---

### Phase 5 — Generate Models

Generate all Eloquent model files.

---

### Phase 6 — Generate Repositories

Generate interface first, then implementation — one pair per model.

---

### Phase 7 — Update plan.md

Append the generated file list to `.specify/specs/{NNN}-{module-name}/plan.md`.

---

## Code Templates

### Migration

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('[table_name]', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->ulid('tenant_id')->index(); // remove if not TENANT_AWARE

            // --- Business columns ---
            $table->string('[column]');
            $table->string('[status_column]')->default('[default_value]');
            $table->decimal('[amount_column]', 10, 2);
            $table->timestamp('[date_column]')->nullable();

            // --- Intra-subdomain foreign keys ---
            $table->ulid('[parent_id]')->index();
            $table->foreign('[parent_id]')
                  ->references('id')
                  ->on('[parent_table]')
                  ->cascadeOnDelete();

            // --- Cross-subdomain logical references (no FK constraint) ---
            $table->ulid('[external_id]'); // logical reference to {subdomain}.{table}

            $table->timestamps();
            // $table->softDeletes(); // uncomment only if deleted_at in DBML

            // --- Composite indexes ---
            $table->index(['tenant_id', '[status_column]'], 'idx_[table]_tenant_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('[table_name]');
    }
};
```

---

### Eloquent Model

```php
<?php

declare(strict_types=1);

namespace [PackageNamespace]\Models;

use Opscale\Validations\Validatable;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
// use Illuminate\Database\Eloquent\SoftDeletes;
use [PackageNamespace]\Models\Enums\[StatusEnum];
use [PackageNamespace]\Models\Repositories\[ModelName]Repository;
use [PackageNamespace]\Models\ValueObjects\[VOName];

/**
 * @property string $id            ULID primary key
 * @property string $tenant_id     Tenant scope (ULID)
 * @property [StatusEnum] $status  Current lifecycle state
 * @property string $[column_1]    [Business description]
 * @property string $[parent_id]   ULID reference to [ParentModel]
 * @property \Illuminate\Support\Carbon $created_at
 * @property \Illuminate\Support\Carbon $updated_at
 */
class [ModelName] extends Model
{
    use HasUlids, Validatable, [ModelName]Repository;
    // use SoftDeletes; // uncomment if deleted_at in DBML

    public static $validationRules = [
        '[column_1]'      => ['required', 'string', 'max:255'],
        '[status_column]' => ['required', 'string'],
        '[parent_id]'     => ['required', 'string', 'ulid'],
        // Add one entry per fillable column with appropriate rules
        // Use context-aware rules for unique constraints: ['create' => 'unique:table', 'update' => 'nullable']
    ];

    // protected $table = '[table_name]'; // only if differs from Laravel's default convention



    protected $fillable = [
        'tenant_id',
        '[column_1]',
        '[column_2]',
        '[status_column]',
        '[parent_id]',
    ];

    protected $casts = [
        '[status_column]' => [StatusEnum]::class,
        '[vo_column]'     => [VOName]::class,
        '[date_column]'   => 'datetime',
    ];

    // --- Intra-subdomain relationships ---

    public function [parentModel](): BelongsTo
    {
        return $this->belongsTo([ParentModel]::class, '[parent_id]');
    }

    public function [childModels](): HasMany
    {
        return $this->hasMany([ChildModel]::class, '[foreign_key]');
    }

    // [external_id] is a cross-subdomain logical reference.
    // No Eloquent relationship — query via the target subdomain's repository trait.
}
```

---

### Enum

```php
<?php

namespace [PackageNamespace]\Models\Enums;


/**
 * [Business description of what this enum represents]
 */
enum [EnumName]: string
{
    /** [Business description: what it means for the entity to be in this state] */
    case [PascalCase] = '[Title Case Value]';

    /** [Business description] */
    case [PascalCase] = '[Title Case Value]';

    /**
     * Check if the current status can transition to the given status.
     */
    public function canTransitionTo(self $status): bool
    {
        return match ($this) {
            self::[PascalCase] => in_array($status, [self::[NextState], self::[NextState]]),
            self::[PascalCase] => in_array($status, [self::[NextState]]),
            self::[TerminalState] => false, // terminal state — no transitions allowed
        };
    }
}
```

---

### Repository (Trait)

```php
<?php

namespace [PackageNamespace]\Models\Repositories;

use Illuminate\Database\Eloquent\Builder;
use [PackageNamespace]\Models\Enums\[StatusEnum];

trait [ModelName]Repository
{
    /**
     * Boot the trait — register model event hooks.
     */
    public static function boot[ModelName]Repository(): void
    {
        // Validate status transitions on update
        static::updating(function ($model) {
            if ($model->isDirty('status')) {
                $original = $model->getOriginal('status');
                $current = $original instanceof [StatusEnum]
                    ? $original
                    : [StatusEnum]::from($original);

                $new = $model->status;
                $next = $new instanceof [StatusEnum]
                    ? $new
                    : [StatusEnum]::from($new);

                if (!$current->canTransitionTo($next)) {
                    abort(422, __('Invalid status transition from :current to :new.', [
                        'current' => $current->value,
                        'new'     => $next->value,
                    ]));
                }
            }
        });
    }

    // --- Scopes (domain-specific queries from DBML indexes + spec Business Rules) ---

    public function scope[ActiveStateName](Builder $query): Builder
    {
        return $query->where('status', [StatusEnum]::[ActiveCase]->value);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereNotIn('status', [
            [StatusEnum]::[TerminalState1]->value,
            [StatusEnum]::[TerminalState2]->value,
        ]);
    }

    // Add one scope per DBML index and per Business Rule that implies a query pattern

    // --- Write methods (domain-specific creation/mutation patterns) ---

    /**
     * Create a [ModelName] from [specific source/context].
     * Use when standard create() is insufficient — e.g. requires data mapping,
     * defaults derived from context, or coordinated setup.
     */
    public function createFrom[Context](array $data): static
    {
        return static::create([
            'tenant_id' => $data['tenant_id'],
            '[field]'   => $data['[source_field]'],
            'status'    => [StatusEnum]::[InitialState],
            // map and default fields specific to this creation path
        ]);
    }
}
```

---

### Value Object

```php
<?php

declare(strict_types=1);

namespace [PackageNamespace]\Models\ValueObjects;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

/**
 * [Business description of this Value Object]
 */
readonly class [VOName] implements CastsAttributes
{
    public function __construct(
        public readonly [type] $[property1],
        public readonly [type] $[property2],
    ) {
        // Validation rules derived from spec Business Rules
        if ($this->[property1] < 0) {
            throw new \InvalidArgumentException('[Property1] cannot be negative.');
        }
    }

    /** Reconstruct from stored database value(s). */
    public function get(Model $model, string $key, mixed $value, array $attributes): self
    {
        return new self(
            [property1]: $attributes['[column_1]'],
            [property2]: $attributes['[column_2]'],
        );
    }

    /** Prepare for storage. */
    public function set(Model $model, string $key, mixed $value, array $attributes): array
    {
        return [
            '[column_1]' => $value->[property1],
            '[column_2]' => $value->[property2],
        ];
    }
}
```

---

## Domain Rules

1. **Strict traceability** — every class maps to a DBML element. Nothing invented.
2. **No logic in models** — only `$fillable`, `$casts`, relationships, `$validationRules`.
3. **Repository is a trait** — mixed into the model, not a separate class. Scopes + boot method only.
4. **Enum values are Title Cased** — `case InProgress = 'In Progress'`, never `'in_progress'`.
5. **Status enums** — when the enum maps to a column named `status`, add `canTransitionTo(self $status): bool` with inline `match()`.
6. **Models use Validatable** — `use Opscale\Validations\Validatable` and `public static $validationRules`.
7. **@property docblocks** — every model column documented, ULID columns typed as `string`, not `int`.
8. **ULID everywhere** — `$table->ulid('id')->primary()` in migrations; `HasUlids` trait in models.
9. **Generate order** — enums → VOs → migrations → models (with repository trait) → repository traits.
10. **Cross-subdomain = no FK** — logical reference columns get a comment, never `->foreign()`.
11. **Tenant scoping in scopes** — if TENANT_AWARE, every scope method applies `->where('tenant_id', $tenantId)`.
12. **Value Objects are immutable** — `readonly class`, constructor validation, no setters.
13. **`declare(strict_types=1)`** — every PHP file without exception.
