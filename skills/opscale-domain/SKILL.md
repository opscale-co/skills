---
name: opscale-domain
description: >
  Generates the PHP domain layer (migrations, models, enums, repositories,
  value objects) from the DBML. Step 5 — first step of Generate, runs after
  Plan, before opscale-ui. Trigger: "generate the domain", "create the models",
  "build the domain layer".
  Use it whenever the PHP domain layer must be generated from DBML, even if just "build the models". Not for Nova UI (opscale-ui) or Action logic (opscale-logic).
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

This skill is **Step 1 of the Generate phase**. The full prerequisite chain `init → process → dbml → bpmn` must be PASS before this skill runs — partial Plan phase is not acceptable. After this skill, `opscale-ui` is next.

---

## Output: File Structure

```
database/
└── migrations/
    └── YYYY_MM_DD_HHMMSS_create_{table}_table.php       (one per table — at package root)
src/
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
- **No `tenant_id` column** — Opscale is single-tenant; isolation is at the database level
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
- No `scopeForTenant` — the deployment model is one database per implementation; tenancy is not an application concern
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

#### Strategy: deterministic scripts under parallel agents

Generation is **always deterministic** — every file produced by this skill
comes out of a Node.js script that renders a template from a JSON input. The
parallel agents (enum-generator, value-object-generator, migration-generator,
model-generator, repository-generator) are thin wrappers: their only job is to
take the JSON the skill hands them, run the corresponding script, and report
the result. They never write PHP themselves.

| Script | Template | Agent |
|--------|----------|-------|
| `scripts/generate-enum.mjs` | `templates/enum.php.tmpl` | enum-generator |
| `scripts/generate-value-object.mjs` | `templates/value-object.php.tmpl` | value-object-generator |
| `scripts/generate-migration.mjs` | `templates/migration.php.tmpl` | migration-generator |
| `scripts/generate-model.mjs` | `templates/model.php.tmpl` | model-generator |
| `scripts/generate-repository.mjs` | `templates/repository.php.tmpl` | repository-generator |

The JSON contract for each script is documented in the header comment of the
`.mjs` file. The skill is responsible for normalizing the DBML into that JSON
before spawning the agents — the scripts do **not** parse DBML.

Conflict policy is consistent across all scripts:

- target missing → WRITE
- target exists & identical → SKIP
- target exists & differs → CONFLICT: a `*.opscale-preview` sidecar is written
  and the real file is left untouched. The skill surfaces the diff to the user.

Three invariants the JSON normalization must respect (template bugs they prevent):

- Empty `casts` array → the script emits `[]` literally, never joins an empty list.
- Sibling FKs to the same parent → derive the relation method name from the FK
  column (not the parent model); track used names per class.
- `BelongsTo` / `HasMany` imports → only included when ≥ 1 of that relation
  exists in the input.

#### Batching when N is very large

If even the deterministic generator hits resource limits (60+ entities, deep
relationships), split the emission phases. Within a phase, all files are
generated in one pass.

| Inventory size | Strategy |
|----------------|----------|
| 21–60 entities | Single generator pass; smoke gate at the end |
| 60+ entities | Split into chunks (enums → first 20 migrations → first 20 models → next 20 migrations …) to bound peak file-write cost |

Batching is a **performance** decision, never a **scope** decision — every
entity in the DBML must be generated. Never drop or defer entities to reduce
work.

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
  - 1 migration in database/migrations/
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
| Acceptance | Schema matches DBML; status transitions defined (if status enum) |
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

All file generation is performed by the deterministic scripts in `scripts/`,
each rendering a template from `templates/`. The exhaustive PHP code that used
to live in this section is now the source of truth in those template files.

| Artifact | Template file | Script |
|----------|--------------|--------|
| Migration | `templates/migration.php.tmpl` | `scripts/generate-migration.mjs` |
| Eloquent Model | `templates/model.php.tmpl` | `scripts/generate-model.mjs` |
| Repository Trait | `templates/repository.php.tmpl` | `scripts/generate-repository.mjs` |
| Enum | `templates/enum.php.tmpl` | `scripts/generate-enum.mjs` |
| Value Object | `templates/value-object.php.tmpl` | `scripts/generate-value-object.mjs` |

The JSON input contract for each script is documented in its header comment.
The skill's job during Phases 3–7 is to normalize the DBML + spec into that
JSON; the script does the rest.

### Generator pitfalls — verified against real modules

These bugs slipped through earlier template versions on ~20+ entity packages.
The current scripts/templates enforce most of them structurally — they are
listed here so the **skill** can keep enforcing the one rule it owns
(collision-free relation method names).

1. **Empty `$casts`** — STRUCTURAL: the template renders `protected $casts = [];`
   literally when no columns are cast. No skill action needed.

2. **Sibling FK collision** (skill responsibility) — when two columns reference
   the same parent table (`source_x_id`, `target_x_id`), deriving the relation
   method from the parent model yields the same name twice → fatal redeclare.
   When normalizing the JSON, derive method names from the COLUMN
   (`source_x_id → sourceX()`, `target_x_id → targetX()`). Track used names
   per class and append the parent model on collision.

3. **Conditional imports** — STRUCTURAL: `generate-model.mjs` only imports
   `BelongsTo` / `HasMany` (etc.) when ≥ 1 of that relation type is present.

---

## Phase 8 — Smoke gate (MANDATORY before marking the skill complete)

The auto-reported checkboxes in the completeness gate are not enough — too many
template bugs (empty `$casts`, sibling-FK collisions, unused imports, missing
notes) only surface when PHP actually parses and Laravel actually loads the
classes. Run these three checks in order; any failure means the skill is NOT
done:

```bash
# 1. Every generated PHP file parses (syntactic guarantee)
find src/Models database/migrations -name '*.php' -print0 \
  | xargs -0 -n1 php -l > /dev/null \
  || { echo "❌ php -l failed"; exit 1; }

# 2. Composer autoload finds every class (autoload + namespace guarantee)
composer dump-autoload --no-scripts > /dev/null
php -r 'require "vendor/autoload.php";
  foreach (glob("src/Models/*.php") as $f) {
    $class = "[PackageNamespace]\\\\Models\\\\" . basename($f, ".php");
    if (! class_exists($class)) { fwrite(STDERR, "Missing: $class\n"); exit(1); }
  }
  echo "OK\n";'

# 3. Every migration applies to a fresh SQLite db (schema guarantee)
vendor/bin/testbench workbench:create-sqlite-db --ansi
vendor/bin/testbench migrate:fresh --ansi
```

If any of the three fails, fix the generator/template before declaring the
skill complete. Do NOT mark the gate `PASS` based on the file count alone —
auto-reporting was the #1 source of false-positive completions in earlier
runs.

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
13. **Single-tenant deployment** — never emit `tenant_id` columns, `scopeForTenant`, or any per-row tenancy filter. Isolation is at the database level; each consuming application installs the module against its own database.
14. **Value Objects are immutable** — `readonly class`, constructor validation, no setters.
15. **`declare(strict_types=1)`** — every PHP file without exception.
16. **Empty `$casts` is literal `[]`** — never emit `[ , ]`. Generators must check `count($casts) > 0` before joining.
17. **Relation method names derive from FK column, not parent model** — two FKs to the same parent (e.g. `source_x_id` + `target_x_id`) yield distinct method names by deriving from the column. Track a `$used` set and append the parent model on collision.
18. **Conditional relation imports** — `use ...\Relations\BelongsTo` (and `HasMany`) only when the model has ≥ 1 of that relation. Catalog tables with no FKs get no relation imports.
