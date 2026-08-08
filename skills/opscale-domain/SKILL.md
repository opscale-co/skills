---
name: opscale-domain
description: >
  Generates the PHP domain layer (migrations, models, enums, repositories,
  value objects) plus its Unit tests and factories, from the ontology manifest
  and DBML. First step of Generate code, after opscale-init, before
  opscale-logic. Trigger: "generate the domain", "create the models",
  "build the domain layer".
  Use it whenever the PHP domain layer must be generated, even if just "build the models". Not for Action logic (opscale-logic) or Nova UI (opscale-ui).
---

# opscale-domain

## Context

### Purpose

Transform the planned module into a complete PHP domain layer. The **ontology**
(`docs/plan/ontology.mmd` + `ontology.txt`) is the **manifest** — the index of what to
build: it enumerates every entity (one `%% entity:` line / one tree node) the module owns.
`docs/plan/dbml.dbml` is the **detail** — the columns, types, enums, and FKs for each of
those entities. Every class generated maps 1:1 to an entity in the manifest and a table in
the DBML; nothing is created that cannot be traced back to both.

Beyond the classes, this skill also generates the domain's **Unit tests** (domain in
isolation) and **factories + a seeder skeleton**, so the layer ships verified and seedable.
Output files are written to the package source directory and listed in
`.specify/specs/001-mvp/plan.md` (domain section).

### Prerequisites — Plan phase complete AND the harness ready

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has stood up the harness | `.specify/memory/constitution.md` exists and the MVP feature `.specify/specs/001-mvp/` is open | Stop. Run `/opscale-init` first. |
| 2 | `opscale-process` has been run | `docs/plan/process.txt` exists and PASS | Stop. Run `/opscale-process`. |
| 3 | `opscale-dbml` has been run | `docs/plan/dbml.dbml` exists and PASS | Stop. Run `/opscale-dbml`. |
| 4 | `opscale-bpmn` has been run | `docs/plan/bpmn.bpmn` exists and PASS | Stop. Run `/opscale-bpmn`. |
| 5 | `opscale-ontology` has closed the Plan | `docs/plan/ontology.mmd` + `ontology.txt` exist | Stop. Run `/opscale-ontology` — it is the manifest this skill iterates. |

This skill is the **first step of Generate (code)**. The full prerequisite chain `init → process → dbml → bpmn → ontology` must be complete before this skill runs: `opscale-init` has already stood up the dev/test harness (Pest, testbench, phpstan, linters) and opened the MVP feature, so this skill only adds tasks and generates. After this skill, `opscale-logic` is next.

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
tests/
└── Unit/
    ├── Models/{ModelName}Test.php                       (one per model)
    ├── Enums/{EnumName}Test.php                         (one per enum)
    ├── ValueObjects/{VOName}Test.php                    (one per VO)
    ├── Repositories/{ModelName}RepositoryTest.php       (one per repository)
    └── Database/{TableName}SchemaTest.php               (one per migration)
database/
└── factories/
    └── {ModelName}Factory.php                           (one per model)
workbench/database/seeders/
└── DatabaseSeeder.php                                   (skeleton block only — markers)
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

**Business types resolve through the binding — verify, never guess.** The DBML carries no physical types: every business column's type IS a slug (`email`, `money`, `quantity`, `identifier`, `document`, …). The concrete migration column, the model `$casts` entry, AND the model `$validationRules` for that column all come from resolving the slug through `.specify/memory/business-types.php` (the Laravel/Nova binding of the canonical registry in `docs/plan/context/business-types.md`) — e.g. `email → $table->string('{col}', 255)` + `['email','max:255']`, `money → $table->decimal('{col}', 12, 2)`, `identifier → $table->ulid('{col}')`. Read the binding for the actual field/rules/config; do not invent a type or a rule. Every slug used in the DBML MUST exist in the binding — a missing slug is a hard stop, not a fallback to `varchar`. The gate (Phase 6) asserts this explicitly.

**Migrations:**
- One migration per DBML table; increment timestamp by 1 second to enforce dependency order
- `id` → `$table->ulid('id')->primary()`
- **No `tenant_id` column** — Opscale is single-tenant; isolation is at the database level
- **Business-typed columns → the binding's storage.** The DBML declares business types as column types (`email`, `money`, `quantity`, …) and carries no physical types; resolve each slug through `.specify/memory/business-types.php` to the concrete column (`email` → `$table->string('{col}', 255)`, `money` → `$table->decimal('{col}', 12, 2)`, `identifier` → `$table->ulid('{col}')`, …)
- Enum columns → `$table->string('{col}')->default('{default}')`
- Timestamps → `$table->timestamps()`
- Soft deletes → `$table->softDeletes()` only if `deleted_at` in DBML
- Intra-subdomain FK → `$table->foreign('{col}')->references('id')->on('{prefix}_{table}')->cascadeOnDelete()`
- Cross-subdomain reference → `$table->ulid('{col}')` + comment: `// logical reference to {subdomain}.{table} — no FK constraint`
- DBML indexes → `$table->index(['{col}'])` or composite

**Eloquent Models:**
- `@property` docblock for every column — type must be `string` for ULIDs (not `int`)
- Use `Validatable` from `opscale/validations` and declare `public static $validationRules` — the rule array for each business column is the `rules` list resolved from the binding (`.specify/memory/business-types.php`), merged with the DBML constraints (`required` for `not null`, `unique`, `nullable`)
- Use `{ModelName}Repository` trait
- `protected $table = '{prefix}_{table}'` — ALWAYS emitted with the subdomain prefix
- Use `HasUlids` trait — handles PK type and ULID generation automatically
- `protected $fillable` — all business columns except `id`, timestamps, `deleted_at`
- `protected $attributes` — default values for columns with DBML `default:`. Emitted as literal PHP value.
- `protected $casts` — enum columns → Enum class; VO columns → Cast class; every business-typed column (the DBML column type IS the slug: `email`, `money`, …) → the binding's storage, `cast` and `rules` (`$validationRules`) — the DBML carries no physical types, so migrations/casts always resolve slug → storage through the Laravel binding at `.specify/memory/business-types.php`; canonical slugs defined in `docs/plan/context/business-types.md`
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
19. **Ontology is the manifest, DBML is the detail** — enumerate entities from `docs/plan/ontology.mmd`; take columns/types from `docs/plan/dbml.dbml`. The two must agree entity-for-entity before any generation.
20. **Business types resolve through the binding** — migration column, `$casts`, and `$validationRules` all come from `.specify/memory/business-types.php`. A slug missing from the binding is a hard stop, never a `varchar` fallback.
21. **Ship verified** — every generated component gets a Unit test (domain in isolation, in-memory SQLite); the layer is not done until `composer test --testsuite=Unit`, `composer lint`, and `composer analyse` are all green.
22. **Factories per model, seeder skeleton only** — one `{Model}Factory` each; the `DatabaseSeeder` carries only the idempotent `opscale-domain:seed` skeleton (admin + one row per aggregate). The connected DEMO dataset is built later, in the Presentation phase.

## Steps

### Phase 1 — Inventory from the ontology manifest, detail from the DBML

Read the **manifest first**: `docs/plan/ontology.mmd` (and `ontology.txt`) is the index of what to build — enumerate every entity the module owns from its `%% entity: {kebab} | {Business name} | {aliases} | {table} | {enums}` lines (one per stamped table) and every `%% external:` ref. That list is the exhaustive set of classes to generate; it is the manifest/summary.

Then read the **detail**: `docs/plan/dbml.dbml` (and `docs/plan/context/external-refs.md` if present) supplies the columns, business-type slugs, enums, defaults, indexes, and FKs for each entity the manifest named. The ontology says *which* entities exist; the DBML says *what each one contains*. Cross-check: every `%% entity:` in the manifest must have a matching `Table` in the DBML and vice versa — a mismatch means the Plan is inconsistent; stop and reconcile before generating.

Present the full generation plan. **There is no cap on the number of entities, enums, or Value Objects** — generate every element the manifest declares, regardless of count.

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

### Phase 2 — Drive spec-kit: one task per entity (bundle) on the MVP feature

`opscale-init` already opened the MVP feature at `.specify/specs/001-mvp/`. Do **not** create a new feature — **add** the domain tasks to that existing MVP feature so the whole module lives in one spec. Formalize the domain plan through spec-kit so every entity becomes a tracked task that `/speckit.implement` checks against.

**The atomic unit is the entity bundle** — one task per entity that covers **all the files generated for that entity**: migration + model + enums used exclusively by it + value objects used exclusively by it + repository trait. Shared enums and shared VOs get their own small task.

**2a. Run `/speckit.plan`** (scoped to the open `001-mvp` feature) with the domain inventory from Phase 1:

```
/speckit.plan "Domain layer for {module-name}: [N] entities from docs/plan/dbml.dbml.
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
[ ] Each entity task lists migration + model + repository + owned enums + owned VOs + its Unit test(s) + its factory in Outputs
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

**3e. Models.** Generate all Eloquent model files. Models import contracts and the trait when normalizing each model's `cross_subdomain_refs`. Pass each model's `entity_id` (the kebab-case id that opens its table's Note in `docs/plan/dbml.dbml` — the table name with dashes) and `entity_name` (the canonical business name) in the payload — the generator stamps them as the class docblock's `@entity` tag.

**3f. Repositories.** Generate the repository trait per model.

**3g. Verify the name lineage.** There is no lineage file to fill — the lineage is the kebab-id chain: the `{kebab} — ` opening of each table Note in `docs/plan/dbml.dbml` → the `@entity {kebab}` docblock the model generator just stamped (contracts carry `@entity ref:{slug}`). Verify it closed: every table in `docs/plan/dbml.txt` has a model whose docblock carries that table's kebab id (`grep -r "@entity" src/Models` and compare). A model missing its `@entity` tag means its payload omitted `entity_id` — regenerate it. This is what keeps stakeholders and developers aligned: one grep of the kebab id returns the table, its business meaning, and the class.

**3h. Update plan.md.** Append the generated file list to `.specify/specs/001-mvp/plan.md`, including the `Task ID` from `tasks.md` for each entity bundle so the file → task mapping is traceable.

#### Generator pitfalls — verified against real modules

1. **Empty `$casts`** — STRUCTURAL: the template renders `protected $casts = [];` literally when no columns are cast.
2. **Sibling FK collision** (skill responsibility) — when two columns reference the same parent table, deriving the relation method from the parent model yields the same name twice → fatal redeclare. When normalizing the JSON, derive method names from the COLUMN. Track used names per class and append the parent model on collision.
3. **Conditional imports** — STRUCTURAL: `generate-model.mjs` only imports `BelongsTo` / `HasMany` when ≥ 1 of that relation type is present.

**Wait for user approval before continuing.**

### Phase 4 — Generate Unit tests

The domain must ship verified. Generate the Unit suite that proves each domain building block in **isolation** — no Action calls, no Nova, in-memory SQLite. The test harness (Pest, testbench, `phpunit.xml` with the `Unit` testsuite, `tests/TestCase.php`, `tests/Pest.php`) was already configured by `opscale-init`; this phase only produces the test files.

Spawn the `unit-test-generator` agent in parallel — one instance per domain component — walking the files generated in Phase 3:

| Source (generated in Phase 3) | Agent (`component_type`) | Output |
|-------------------------------|--------------------------|--------|
| `src/Models/*.php` (non-enum, non-VO) | `unit-test-generator` (`model`) | `tests/Unit/Models/{ModelName}Test.php` |
| `src/Models/Enums/*.php` | `unit-test-generator` (`enum`) | `tests/Unit/Enums/{EnumName}Test.php` |
| `src/Models/ValueObjects/*.php` | `unit-test-generator` (`value_object`) | `tests/Unit/ValueObjects/{VOName}Test.php` |
| `src/Models/Repositories/*.php` | `unit-test-generator` (`repository`) | `tests/Unit/Repositories/{ModelName}RepositoryTest.php` |
| `database/migrations/*.php` | `unit-test-generator` (`migration`) | `tests/Unit/Database/{TableName}SchemaTest.php` |

If the layer produced any **support** components (traits, services, helpers, PHPStan rules, casts, exceptions) that are not covered above, spawn `support-test-generator` (`test_level = unit`) for each → `tests/Unit/{Type}/{Name}Test.php`.

These tests verify domain correctness only — immutability, casts, enum cases/transitions, fillable, `$validationRules`, repository scopes, and schema consistency (including that each column resolved to the binding's storage type). Feature tests (Actions) belong to `opscale-logic`; Browser tests belong to `opscale-ui`. Do **not** generate cross-suite tests here.

**Wait for user approval before continuing.**

### Phase 5 — Generate factories + seeder skeleton

So the later Feature/Browser suites (and the Presentation-phase demo) can seed via factories, generate:

**5a. Factories** — one `database/factories/{ModelName}Factory.php` per model. Each `definition()` returns realistic values per column resolved through the business-type binding (`fake()->safeEmail()` for `email`, a decimal for `money`, a ULID for cross-subdomain `identifier` columns, the enum's default `case` for status columns). FK columns default to `{ParentModel}::factory()`. The model already uses `HasUlids`, so the factory does not set `id`.

**5b. Seeder skeleton** — write `workbench/database/seeders/DatabaseSeeder.php` containing only the idempotent **skeleton** between markers:

```php
// >>> opscale-domain:seed:start
// (generated by opscale-domain — do not edit; the connected demo dataset is
//  filled in later, in the Presentation phase. Anything outside the markers survives re-runs.)
// <<< opscale-domain:end
```

Inside the markers: the fixed workbench admin (`admin@laravel.com / password`, used by the Browser `loginToNova()` helper) plus one factory call per aggregate root in FK-topological order. This is the **skeleton only** — the coherent, connected DEMO dataset that walks each process end to end is NOT built here; a later Presentation-phase skill fills it. If `DatabaseSeeder.php` already exists, edit only the marked block and preserve everything outside the markers.

**Wait for user approval before continuing.**

### Phase 6 — Gate: smoke + business types + linters + Unit tests

The auto-reported checkboxes are not enough. Run every check below in order; any failure means the skill is NOT done. Do NOT mark `PASS` on file count alone.

1. **Smoke** — (a) `php -l` on every generated file, (b) composer autoload resolves every model class, (c) `testbench migrate:fresh` applies every migration. Verbatim commands in `references/smoke-gate.md`.
2. **Business types** — assert every business-typed column resolved through `.specify/memory/business-types.php`: no `varchar`/`text`/raw `decimal(8,2)` guesses in migrations for columns whose DBML slug maps elsewhere, and every model's `$validationRules` key set matches its `$fillable` with rules taken from the binding. A column whose slug is absent from the binding is a hard fail.
3. **Linters** — `composer lint` and `composer analyse` (config installed by `opscale-init`) both exit 0.
4. **Unit tests green** — `composer test --testsuite=Unit` exits 0. Every generated Unit test runs and passes.

Only when all four are green is the gate `PASS`.

**Wait for user approval before continuing.**

## Sample

Model + Repository trait + Enum + migration + Unit test + factory excerpts — see `references/sample-output.md`.

## Success condition

```bash
composer install \
  && vendor/bin/testbench migrate:fresh --env=testing \
  && composer lint && composer analyse \
  && composer test --testsuite=Unit
```

Exit code 0 = pass.
