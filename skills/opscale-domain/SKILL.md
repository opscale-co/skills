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

## Prerequisites — Plan phase MUST be complete

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init` first. |
| 2 | `opscale-process` has been run | `spec.md` exists and PASS | Stop. Run `/opscale-process`. |
| 3 | `opscale-dbml` has been run | `data-model.md` exists and PASS | Stop. Run `/opscale-dbml`. |
| 4 | `opscale-bpmn` has been run | `process.md` exists and PASS | Stop. Run `/opscale-bpmn`. |
| 5 | Constitution `TENANT_AWARE` value is readable | Read `.specify/memory/constitution.md` | Fix constitution first. |

This skill is **Step 1 of the Generate phase**. The full prerequisite chain `init → process → dbml → bpmn` must be PASS before this skill runs — partial Plan phase is not acceptable. After this skill, `opscale-ui` is next.

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

Read `data-model.md` and present the full generation plan. **There is no cap on
the number of entities, enums, or Value Objects** — generate every element the
DBML declares, regardless of count. A 3-entity module and a 120-entity module
are both valid inputs.

```
Domain inventory for [Module Name]:

Enums (generated first): [N]
  - [EnumName]: [value1, value2, ...]
  - ... (continue listing every enum — do NOT truncate)

Value Objects: [N]
  - [VOName]: columns [col1, col2]
  - ... (every VO — do NOT truncate)

Migrations + Models (in dependency order): [N]
  1. [table_a] → [ModelA]  (no FK dependencies)
  2. [table_b] → [ModelB]  (depends on table_a)
  ... (every entity — do NOT truncate)

Repository traits (mixed into their model): [N]
  - [ModelA]Repository
  - ... (one per model — do NOT truncate)

Total files to generate: [migrations] + [models] + [enums] + [VOs] + [repository traits]

Confirm before generating?
```

Wait for confirmation.

#### Batching for large models

When the inventory exceeds the practical parallel-spawn limit (≈ 20 agents per
batch), split generation into sequential batches by phase. Within a phase, all
agents run in parallel — across batches they run sequentially.

| Inventory size | Strategy |
|----------------|----------|
| ≤ 20 entities | Single batch per phase — spawn all agents in parallel |
| 21–60 entities | Split each phase into batches of ~20 (e.g. 3 batches × 20 entities for 60 models) |
| 60+ entities | Split each phase into batches of ~20; consider running phases in chunks (enums → 20 migrations → 20 models → next 20 migrations → next 20 models …) to bound peak parallelism |

Batching is a **performance** decision, never a **scope** decision — every
entity in the DBML must be generated. Never drop or defer entities to reduce
work. If a batch fails, retry the failed agents — do not silently skip.

---

### Phase 2 — Drive spec-kit: one task per entity (bundle)

Before generating any code, formalize the domain plan through spec-kit so every
entity becomes a tracked task. This is what `opscale-test` later binds to (one
Unit-test task per entity bundle) and what `/speckit.implement` checks against.

**The atomic unit is the entity bundle** — one task per entity that covers
**all the files generated for that entity**: migration + model + enums used
exclusively by it + value objects used exclusively by it + repository trait.
Shared enums and shared VOs (used by multiple entities) get their own small
task. Do NOT split an entity into a "model task" + "migration task" + "repo
task" — those always ship together.

**2a. Run `/speckit.plan`** with the domain inventory from Phase 1:

```
/speckit.plan "Domain layer for {module-name}: [N] entities from data-model.md.
Generate one task per entity covering its full bundle:
  - 1 migration in src/Database/Migrations/
  - 1 Eloquent model in src/Models/
  - 1 repository trait in src/Models/Repositories/
  - any enums declared exclusively for that entity in src/Models/Enums/
  - any value objects declared exclusively for that entity in src/Models/ValueObjects/

Plus separate tasks for shared building blocks:
  - 1 task per shared Enum (used by ≥2 entities)
  - 1 task per shared ValueObject (used by ≥2 entities)

Dependency order from DBML FK graph: parents before children."
```

Confirm `plan.md` with the user.

**2b. Run `/speckit.tasks`** with the bundle contract:

| Task field | Value |
|------------|-------|
| Title | `Implement {EntityName}` (for entity bundles) or `Implement {EnumName} enum` / `Implement {VOName} value object` (for shared building blocks) |
| Description | One sentence from the DBML entity Note |
| Inputs | DBML table definition, columns, FK targets |
| Outputs | List of files the bundle produces (migration + model + enums + VOs + repository) |
| Acceptance | Schema matches DBML; status transitions defined (if status enum); tenant scoping (if TENANT_AWARE) |
| Depends on | Task IDs of parent entities (FK targets) + shared enum/VO tasks the entity uses |

```
/speckit.tasks "Generate one task per entity bundle from plan.md, plus one task
per shared Enum and shared ValueObject. Each entity task lists ALL bundle files
in its Outputs. Dependency edges follow the FK graph (parent entities first).
Precede every implementation task with a 'Test {Entity}' task (opscale-test
fills it later). Do not split an entity into per-file tasks."
```

**Verify `tasks.md`:**

```
[ ] One bundle task per entity — count matches the inventory
[ ] One task per shared Enum and shared ValueObject
[ ] Each entity task lists migration + model + repository + owned enums + owned VOs in Outputs
[ ] Each task has a matching 'Test ' task preceding it
[ ] FK parents appear before children in the dependency edges
[ ] No entity is split across multiple tasks
```

If any check fails, regenerate `tasks.md` before continuing.

### Phase 3 — Generate Enums

Generate all enum PHP files completely.
Enums must exist before models reference them in `$casts`.

---

### Phase 4 — Generate Value Objects

Generate all VO PHP files completely.

---

### Phase 5 — Generate Migrations

Generate migration files in dependency order (parents before children).

---

### Phase 6 — Generate Models

Generate all Eloquent model files.

---

### Phase 7 — Generate Repositories

Generate interface first, then implementation — one pair per model.

---

### Phase 8 — Update plan.md

Append the generated file list to `.specify/specs/{NNN}-{module-name}/plan.md`, including the `Task ID` from `tasks.md` for each entity bundle so the file → task mapping is traceable.

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

1. **No entity cap — generate every element the DBML declares.** A module with 120 entities is just as valid as one with 3. If the inventory exceeds the parallel-spawn limit, split into sequential batches (see Workflow → Phase 1 → Batching). Never drop, defer, or "summarize" entities to reduce work; never ask the user to trim the DBML to fit a quota.
2. **One entity = one bundle task in `tasks.md`.** Migration + Model + Repository trait + owned Enums + owned VOs always ship as a single task. Shared Enums and shared VOs are their own small tasks. Never split an entity across multiple tasks; never merge two entities into one task. spec-kit plan + tasks runs BEFORE any generator agent is spawned.
3. **Strict traceability** — every class maps to a DBML element. Nothing invented.
4. **No logic in models** — only `$fillable`, `$casts`, relationships, `$validationRules`.
5. **Repository is a trait** — mixed into the model, not a separate class. Scopes + boot method only.
6. **Enum values are Title Cased** — `case InProgress = 'In Progress'`, never `'in_progress'`.
7. **Status enums** — when the enum maps to a column named `status`, add `canTransitionTo(self $status): bool` with inline `match()`.
8. **Models use Validatable** — `use Opscale\Validations\Validatable` and `public static $validationRules`.
9. **@property docblocks** — every model column documented, ULID columns typed as `string`, not `int`.
10. **ULID everywhere** — `$table->ulid('id')->primary()` in migrations; `HasUlids` trait in models.
11. **Generate order** — enums → VOs → migrations → models (with repository trait) → repository traits.
12. **Cross-subdomain = no FK** — logical reference columns get a comment, never `->foreign()`.
13. **Tenant scoping in scopes** — if TENANT_AWARE, every scope method applies `->where('tenant_id', $tenantId)`.
14. **Value Objects are immutable** — `readonly class`, constructor validation, no setters.
15. **`declare(strict_types=1)`** — every PHP file without exception.
