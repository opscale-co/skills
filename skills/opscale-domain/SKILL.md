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

## Context

### Purpose

Transform the validated DBML into a complete PHP domain layer. Every class generated
maps 1:1 to an element in `docs/plan/domain.dbml`. Nothing is created that cannot be traced
back to the DBML. Output files are written to the package source directory and listed
in `.specify/specs/{NNN}-{module-name}/plan.md` (domain section).

### Prerequisites — Plan phase MUST be complete

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init` first. |
| 2 | `opscale-process` has been run | `docs/plan/process.txt` exists and PASS | Stop. Run `/opscale-process`. |
| 3 | `opscale-dbml` has been run | `docs/plan/domain.dbml` exists and PASS | Stop. Run `/opscale-dbml`. |
| 4 | `opscale-bpmn` has been run | `docs/plan/logic.bpmn` exists and PASS | Stop. Run `/opscale-bpmn`. |

This skill is **Step 1 of the Generate phase**. The full prerequisite chain `init → process → dbml → bpmn` must be PASS before this skill runs. After this skill, `opscale-ui` is next.

### Generator contract — scaffold, then customize

The generators in `scripts/` exist to **minimize the code the LLM writes**, not to finish the class. Each generator emits the **initial scaffold** from the DBML; you then **always customize** what a template cannot anticipate:

- **Repositories** — the scaffold has the base trait and constructor; you add the **query methods** the Actions will need.
- **Models** — confirm relationships, casts, and scopes that depend on business meaning.
- **Value Objects / Enums** — add the validation and helpers the domain implies.

Rule: run the generator first, then read each generated file and complete it.

### Output file structure

```
database/
└── migrations/
    └── YYYY_MM_DD_HHMMSS_create_{table}_table.php       (one per table)
src/
├── Contracts/
│   └── {ContractName}Contract.php                       (only if ≥1 external-ref)
├── Models/
│   ├── Concerns/
│   │   └── HasContractRelations.php                     (generated once if ≥1 external-ref)
│   ├── Enums/
│   │   └── {EnumName}.php                               (one per DBML enum)
│   ├── Repositories/
│   │   └── {ModelName}Repository.php                    (trait — one per model)
│   ├── ValueObjects/
│   │   └── {ValueObjectName}.php                        (one per VO)
│   └── {ModelName}.php                                  (one per table)
```

### Cross-subdomain virtual relations

When `docs/plan/context/external-refs.md` carries an `external-refs` index, the domain layer emits two extra artifacts (one shared `HasContractRelations` trait + one `{ContractName}Contract` interface per slug) and wires every cross-subdomain column into a real `BelongsTo` resolved through a host-supplied contract. The host binds an implementation; domain registers no default binding. For verbatim PHP templates and the column → relation-method naming convention, see `references/cross-subdomain-contracts.md`.

### Generation rules

**Subdomain prefix on tables.** In the Opscale ontology **subdomain = module** (do not confuse with *subprocess*, a wait-bounded segment inside the flow). Table names in migrations and models MUST be prefixed with the subdomain (the `MODULE_PREFIX` declared in `.specify/memory/constitution.md`). The DBML keeps entity names un-prefixed — the prefix is applied here, at the infrastructure boundary.

- Migration filename: `YYYY_MM_DD_HHMMSS_create_{prefix}_{table}_table.php`
- Migration body: `Schema::create('{prefix}_{table}', fn (Blueprint $t) => …)`
- Eloquent model: `protected $table = '{prefix}_{table}';`
- Foreign keys inside the same subdomain reference `{prefix}_{other_table}.id`

**Why:** in a modular app multiple subdomains share one database. Without prefixing, an `application` entity in `credits` collides with an `application` in `recruitment`. DBML entity names stay un-prefixed (see `opscale-dbml`) so the domain model reads naturally; the prefix is the infrastructure concern emitted by this skill.

The generators read `MODULE_PREFIX` from `.specify/memory/constitution.md` (either the line `**Module Prefix:** {value}` or the unsubstituted `[MODULE_PREFIX]` token) and apply it automatically.

**Migrations:**
- One migration per DBML table; increment timestamp by 1 second to enforce dependency order
- `id` → `$table->ulid('id')->primary()`
- **No `tenant_id` column** — Opscale is single-tenant; isolation is at the database level
- Enum columns → `$table->string('{col}')->default('{default}')`
- Timestamps → `$table->timestamps()`
- Soft deletes → `$table->softDeletes()` only if `deleted_at` in DBML
- Intra-subdomain FK → `$table->foreign('{col}')->references('id')->on('{prefix}_{table}')->cascadeOnDelete()`
- Cross-subdomain reference → `$table->ulid('{col}')` + comment: `// logical reference to {subdomain}.{table} — no FK constraint`
- DBML indexes → `$table->index(['{col}'])` or composite

**Eloquent Models:**
- `@property` docblock for every column — type must be `string` for ULIDs (not `int`)
- Use `Validatable` from `opscale/validations` and declare `public static $validationRules`
- Use `{ModelName}Repository` trait
- `protected $table = '{prefix}_{table}'` — ALWAYS emitted with the subdomain prefix
- Use `HasUlids` trait — handles PK type and ULID generation automatically
- `protected $fillable` — all business columns except `id`, timestamps, `deleted_at`
- `protected $attributes` — default values for columns with DBML `default:`. Emitted as literal PHP value.
- `protected $casts` — enum columns → Enum class; VO columns → Cast class; dates → `'datetime'`; columns noted `// type:{slug}` in the DBML → the binding's `cast` (and their `rules` go into `$validationRules`) — Laravel binding at `.specify/memory/business-types.php`; canonical slugs defined in `docs/plan/context/business-types.md`
- Relationships only for intra-subdomain FKs
- Cross-subdomain columns → comment: no Eloquent relationship, query via target repo
- `SoftDeletes` trait only if `deleted_at` in DBML
- No business logic in models — only property definitions, casts, relationships, validation rules
- `declare(strict_types=1)` in every file

**Enums:**
- `enum {Name}: string` (PHP 8.3 backed)
- Case name: PascalCase — value: **Title Case** string matching the DBML value exactly
- Every case must have a docblock comment explaining its business meaning
- When the enum is a **status** field, add `canTransitionTo(self $status): bool`
- Docblock describing the business concept

**Repositories:**
- Repository is a **trait**, not a class or interface. Mixed into the Eloquent Model.
- Named `{ModelName}Repository` — used as `use {ModelName}Repository;` inside the model
- Contains a `boot{ModelName}Repository()` static method for model event hooks
- Contains Eloquent **scope methods** for all domain-specific queries
- Scope methods receive a `Builder $query` and return `Builder`
- If the model has a `status` column, the boot method validates the transition on `updating`
- No `scopeForTenant` — the deployment model is one database per implementation
- No `findById`, `create`, `update`, `delete` — those are standard Eloquent on the model itself

**Value Objects:**
- `readonly class` (PHP 8.3+)
- Implements `Illuminate\Contracts\Database\Eloquent\CastsAttributes`
- Constructor validates inputs — throws `\InvalidArgumentException` on invalid data
- `get()` reconstructs the VO from stored column value(s)
- `set()` returns scalar value(s) to store
- Immutable — no setters, no mutators

### Domain Rules

1. **No entity cap — generate every element the DBML declares.** A module with 120 entities is just as valid as one with 3. If the inventory exceeds the parallel-spawn limit, split into sequential batches. Never drop, defer, or "summarize" entities to reduce work.
2. **One entity = one bundle task in `tasks.md`.** Migration + Model + Repository trait + owned Enums + owned VOs always ship as a single task. Shared Enums and shared VOs are their own small tasks. spec-kit plan + tasks runs BEFORE any generator agent is spawned.
3. **Strict traceability** — every class maps to a DBML element. Nothing invented.
4. **No logic in models** — only `$fillable`, `$attributes`, `$casts`, relationships, `$validationRules`.
5. **Repository is a trait** — mixed into the model, not a separate class. Scopes + boot method only.
6. **Enum values are Title Cased** — `case InProgress = 'In Progress'`, never `'in_progress'`.
7. **Status enums** — when the enum maps to a column named `status`, add `canTransitionTo(self $status): bool` with inline `match()`.
8. **Models use Validatable** — `use Opscale\Validations\Validatable` and `public static $validationRules`.
9. **@property docblocks** — every model column documented, ULID columns typed as `string`, not `int`.
10. **ULID everywhere** — `$table->ulid('id')->primary()` in migrations; `HasUlids` trait in models.
11. **Generate order** — enums → VOs → migrations → models (with repository trait) → repository traits.
12. **Cross-subdomain = no FK** — logical reference columns get a comment, never `->foreign()`.
13. **Single-tenant deployment** — never emit `tenant_id` columns, `scopeForTenant`, or any per-row tenancy filter.
14. **Value Objects are immutable** — `readonly class`, constructor validation, no setters.
15. **`declare(strict_types=1)`** — every PHP file without exception.
16. **Empty `$casts` is literal `[]`** — never emit `[ , ]`. Generators must check `count($casts) > 0` before joining.
17. **Relation method names derive from FK column, not parent model** — two FKs to the same parent yield distinct method names. Track a `$used` set and append the parent model on collision.
18. **Conditional relation imports** — `use ...\Relations\BelongsTo` (and `HasMany`) only when the model has ≥ 1 of that relation.

## Steps

### Phase 1 — Inventory the DBML

Read `docs/plan/domain.dbml` (and `docs/plan/context/external-refs.md` if present) and present the full generation plan. **There is no cap on the number of entities, enums, or Value Objects** — generate every element the DBML declares, regardless of count.

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
```

#### Strategy: deterministic scripts under parallel agents

Generation is **always deterministic** — every file produced by this skill comes out of a Node.js script that renders a template from a JSON input. The parallel agents are thin wrappers — they never write PHP themselves.

| Script | Template | Agent |
|--------|----------|-------|
| `scripts/generate-enum.mjs` | `templates/enum.php.tmpl` | enum-generator |
| `scripts/generate-value-object.mjs` | `templates/value-object.php.tmpl` | value-object-generator |
| `scripts/generate-migration.mjs` | `templates/migration.php.tmpl` | migration-generator |
| `scripts/generate-model.mjs` | `templates/model.php.tmpl` | model-generator |
| `scripts/generate-repository.mjs` | `templates/repository.php.tmpl` | repository-generator |
| `scripts/generate-contract.mjs` | `templates/contract.php.tmpl` + `templates/has-contract-relations.php.tmpl` | model-generator (per slug) |

The JSON contract for each script is documented in the header comment of the `.mjs` file. The skill normalizes the DBML into that JSON before spawning the agents — the scripts do **not** parse DBML.

Conflict policy is consistent across all scripts:

- target missing → WRITE
- target exists & identical → SKIP
- target exists & differs → CONFLICT: a `*.opscale-preview` sidecar is written and the real file is left untouched. The skill surfaces the diff to the user.

Three invariants the JSON normalization must respect:

- Empty `casts` array → the script emits `[]` literally.
- Sibling FKs to the same parent → derive the relation method name from the FK column.
- `BelongsTo` / `HasMany` imports → only included when ≥ 1 of that relation exists.

#### Batching when N is very large

| Inventory size | Strategy |
|----------------|----------|
| 21–60 entities | Single generator pass; smoke gate at the end |
| 60+ entities | Split into chunks (enums → first 20 migrations → first 20 models → next 20 migrations …) to bound peak file-write cost |

Batching is a **performance** decision, never a **scope** decision.

**Wait for user approval before continuing.**

### Phase 2 — Drive spec-kit: one task per entity (bundle)

Before generating any code, formalize the domain plan through spec-kit so every entity becomes a tracked task. This is what `opscale-test` later binds to and what `/speckit.implement` checks against.

**The atomic unit is the entity bundle** — one task per entity that covers **all the files generated for that entity**: migration + model + enums used exclusively by it + value objects used exclusively by it + repository trait. Shared enums and shared VOs get their own small task.

**2a. Run `/speckit.plan`** with the domain inventory from Phase 1:

```
/speckit.plan "Domain layer for {module-name}: [N] entities from docs/plan/domain.dbml.
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
| Title | `Implement {EntityName}` or `Implement {EnumName} enum` / `Implement {VOName} value object` |
| Description | One sentence from the DBML entity Note |
| Inputs | DBML table definition, columns, FK targets |
| Outputs | List of files the bundle produces |
| Acceptance | Schema matches DBML; status transitions defined (if status enum) |
| Depends on | Task IDs of parent entities + shared enum/VO tasks the entity uses |

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

**Wait for user approval before continuing.**

### Phase 3 — Generate domain artifacts

Generation proceeds in strict dependency order. All file generation runs through the deterministic scripts in `scripts/` rendering templates from `templates/`.

| Artifact | Template file | Script |
|----------|--------------|--------|
| Migration | `templates/migration.php.tmpl` | `scripts/generate-migration.mjs` |
| Eloquent Model | `templates/model.php.tmpl` | `scripts/generate-model.mjs` |
| Repository Trait | `templates/repository.php.tmpl` | `scripts/generate-repository.mjs` |
| Enum | `templates/enum.php.tmpl` | `scripts/generate-enum.mjs` |
| Value Object | `templates/value-object.php.tmpl` | `scripts/generate-value-object.mjs` |
| Contract + Concern | `templates/contract.php.tmpl`, `templates/has-contract-relations.php.tmpl` | `scripts/generate-contract.mjs` |

**3a. Enums.** Generate all enum PHP files completely. Enums must exist before models reference them in `$casts`.

**3b. Value Objects.** Generate all VO PHP files completely.

**3c. Migrations.** Generate migration files in dependency order (parents before children).

**3d. Contracts + HasContractRelations trait.** If `docs/plan/context/external-refs.md` carries an `external-refs` index, run `scripts/generate-contract.mjs` once per unique slug **before** generating models. Each call emits one `src/Contracts/{ContractName}Contract.php` and (idempotently) the shared `src/Models/Concerns/HasContractRelations.php`. If there is no `docs/plan/context/external-refs.md`, skip this step.

**3e. Models.** Generate all Eloquent model files. Models import contracts and the trait when normalizing each model's `cross_subdomain_refs`.

**3f. Repositories.** Generate the repository trait per model.

**3g. Complete the name lineage.** Open `docs/plan/naming.md` (written by `opscale-dbml`) and fill the **Model class** column: one FQCN per entity row (e.g. `Opscale\Credits\Models\Application`), and the contract class for each external-reference row (e.g. `UsersContract`). If `docs/plan/naming.md` does not exist (legacy module), create it from the DBML tables and the generated classes. This closes the trace canonical business name → table → class that keeps stakeholders and developers aligned.

**3h. Update plan.md.** Append the generated file list to `.specify/specs/{NNN}-{module-name}/plan.md`, including the `Task ID` from `tasks.md` for each entity bundle so the file → task mapping is traceable.

#### Generator pitfalls — verified against real modules

1. **Empty `$casts`** — STRUCTURAL: the template renders `protected $casts = [];` literally when no columns are cast.
2. **Sibling FK collision** (skill responsibility) — when two columns reference the same parent table, deriving the relation method from the parent model yields the same name twice → fatal redeclare. When normalizing the JSON, derive method names from the COLUMN. Track used names per class and append the parent model on collision.
3. **Conditional imports** — STRUCTURAL: `generate-model.mjs` only imports `BelongsTo` / `HasMany` when ≥ 1 of that relation type is present.

**Wait for user approval before continuing.**

### Phase 4 — Smoke gate

The auto-reported checkboxes in the completeness gate are not enough — too many template bugs (empty `$casts`, sibling-FK collisions, unused imports, missing notes) only surface when PHP actually parses and Laravel actually loads the classes. Run three checks in order: (1) `php -l` on every generated file, (2) composer autoload resolves every model class, (3) `testbench migrate:fresh` applies every migration. Any failure means the skill is NOT done.

For the verbatim shell commands, see `references/smoke-gate.md`. Do NOT mark the gate `PASS` based on the file count alone.

**Wait for user approval before continuing.**

## Sample

Model + Repository trait + Enum + migration excerpts — see `references/sample-output.md`.

## Success condition

```bash
composer install && vendor/bin/testbench migrate:fresh --env=testing
```

Exit code 0 = pass.
