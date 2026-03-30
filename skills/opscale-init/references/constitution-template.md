# Opscale Project Constitution

**Project:** [PROJECT_NAME]
**Project Type:** [PROJECT_TYPE]
**Module Prefix:** [MODULE_PREFIX]
**Tenant Aware:** [TENANT_AWARE]
**Created:** [DATE]

> This constitution is the architectural DNA of every Opscale project.
> Claude Code MUST read and comply with it before generating any code, spec, plan, or task.
> It is derived from [opscale-co/strict-rules](https://github.com/opscale-co/strict-rules)
> and supersedes all other instructions. Deviations require explicit documentation.

---

## 0. Project Type

**Type: [PROJECT_TYPE]**

| Type | Description | Example |
|------|-------------|---------|
| `app` | Complete Laravel Nova application containing multiple modules. Deployed via Vapor or similar. | A multi-module SaaS platform |
| `module` | Single bounded-context package within an app. Handles one business subdomain. | `opscale-co/nova-loan-module` |
| `package` | Standalone project with specific functionality. Can have domain, Nova resources, Actions. Published to Packagist. | `nova-api`, `nova-authorization` |
| `library` | Pure utility/infrastructure code. No domain, no Nova, no Actions. | `opscale-co/strict-rules`, `opscale-co/actions` |

### What applies per type

| Skill / Agent | app | module | package | library |
|---------------|:---:|:------:|:-------:|:-------:|
| opscale-init | Yes | Yes | Yes | Yes (simplified) |
| opscale-process | Per module | Yes | -- | -- |
| opscale-dbml | Per module | Yes | -- | -- |
| opscale-bpmn | Per module | Yes | -- | -- |
| opscale-domain | Per module | Yes | Yes (direct) | -- |
| opscale-ui | Per module | Yes | Yes (direct) | -- |
| opscale-logic | Per module | Yes | Yes (direct) | -- |
| opscale-outputs | Per module | Yes | Yes (direct) | -- |
| opscale-debug | Yes | Yes | Yes | Optional |
| opscale-test | Yes | Yes | Yes | Yes (adapted) |
| opscale-release | Yes (deploy-app) | Yes (publish-package) | Yes (publish-package) | Yes (publish-package) |
| opscale-ai | Per module | Yes | -- | -- |

### Library-type sequence

When `PROJECT_TYPE` is `library`, the development sequence is:

```
1. Write code (traits, services, helpers, rules, abstracts)
2. opscale-test   → configure Pest, PHPStan level 8, Duster, Rector
3. opscale-release → configure Semantic Release, CI/CD, SonarQube
```

Steps 1–7 and 11 (spec, DBML, BPMN, domain, Nova, logic, outputs, AI) do NOT apply.
Quality gates still apply in full: PHPStan level 8, Duster, all tests pass, SonarQube.

### App-type orchestration

When `PROJECT_TYPE` is `app`, the application is a container for multiple modules.
Each module lives in its own package directory and follows the full sequence independently.
Cross-module concerns:
- Shared kernel types (if any) live in a dedicated `shared` package
- Cross-module communication uses domain events and IDs only — no direct imports
- The app-level constitution governs all modules within it

### Package vs Module

Both `package` and `module` support the full spec-driven sequence. The difference is context:
- A **module** is a bounded context within a larger application — it handles one business subdomain (loans, KYC, loyalty)
- A **package** is a standalone project with specific functionality that can be used across applications (API tooling, authorization, dashboards)

### Adopting in Existing Projects

The Opscale workflow can be applied to projects that already have code. When adopting:

1. **Run `opscale-init`** in the existing project root — it detects existing files and uses `--here --force`
2. **Join at any step** — if the project already has models and migrations, start at a later step:
   - Has models but no spec → start at `opscale-process` to formalize what exists
   - Has spec but no DBML → start at `opscale-dbml`
   - Has everything but no tests → start at `opscale-test`
3. **Generation agents detect existing files** — when a file already exists at the target path:
   - Identical files are skipped
   - Files with extra content are merged (preserving additions)
   - Conflicting files are flagged for user review — never silently overwritten
4. **Existing code is the source of truth** until the spec catches up — do not delete or overwrite working code to match a new spec. Instead, update the spec to reflect reality, then iterate.
5. **Incremental adoption** — it is valid to apply Opscale conventions to one module at a time in an app. Not every module needs to be spec-driven on day one.

---

## I. Architectural Philosophy

Opscale software is designed in a strict priority order. When there is a conflict between
levels, the higher level always wins.

**Priority 1 — Business (Information Flow)**
The system exists to model how the business works and move information correctly through it.
This means: modeling real business entities, capturing meaningful data, and making information
flow between subdomains reliably. A system with correct information flow but a rough UI is
acceptable. A system with a polished UI but incorrect or incomplete information flow is not.
Business correctness always comes before implementation elegance.

**Priority 2 — End Users (Interface)**
Once the information flow is correct, the system must present it through interfaces that are
appropriate for each user type. UI decisions are secondary to domain decisions — the interface
adapts to the domain, never the other way around. Nova resources, forms, dashboards, and
notifications are shaped by what the business domain requires, not by UI convenience.

**Priority 3 — Technical Team (Maintainability)**
Code quality, patterns, and architecture conventions exist to serve the team maintaining the
system long term. SOLID principles, Clean Architecture layers, and DDD patterns are tools for
keeping the codebase understandable and extensible — they are means, not ends. If applying a
pattern rigorously would harm information flow correctness or user experience, document the
deviation and move on.

**The three design patterns that serve these priorities:**
- **DDD** — ensures the domain model reflects the real business (Priority 1)
- **Clean Architecture** — ensures components communicate predictably (Priority 2 & 3)
- **SOLID** — ensures code units are maintainable and testable (Priority 3)

---

## II. Design Methodology

The Opscale development sequence is skill-driven. Each step below maps to a dedicated skill
that contains its own generation rules. This section defines the **sequence contract**:
what each step requires as input, what it must produce as output, and what cross-step
constraints apply. Do not skip steps. Do not start a step before its required input exists.

---

### Step 1 — Process Spec → `opscale-process`

**Requires:** A business description in any form (sentence, paragraph, notes, transcript).
**Produces:** `.specify/specs/{NNN}/spec.md` — actors, actions, artifacts, business rules, triggers, pre/post conditions.
**Constraint:** No technical terminology. Must be readable by a business owner, not a developer.
**Gate:** The spec must pass its completeness checklist before Step 2 begins.

---

### Step 2 — Domain Model → `opscale-dbml`

**Requires:** A validated `spec.md` from Step 1.
**Produces:** `.specify/specs/{NNN}/data-model.md` — DBML with entities, relationships, enums, and data dictionary.
**Constraint:** Only business entities. No UI fields, no config tables, no infrastructure concerns.
**Gate:** Every entity in the DBML must trace back to an artifact or actor in `spec.md`.
The DBML is the authoritative source — all subsequent code is generated from it, never the reverse.

---

### Step 3 — Process Model → `opscale-bpmn`

**Requires:** A validated `data-model.md` from Step 2.
**Produces:** `.specify/specs/{NNN}/process.md` — BPMN task map with typed tasks.
**Constraint:** Every task must reference at least one entity from the DBML.
No new domain concepts may be introduced here — if something is missing, go back to Step 2.
**Gate:** Every task must be classified as exactly one of: `crud`, `action`, or `output`.

→ Run `/speckit.clarify` after this step before proceeding to planning.

---

### Step 4 — Domain Classes → `opscale-domain`

**Requires:** `data-model.md` (Step 2) + `process.md` (Step 3).
**Produces:** Migrations, Models, Enums, Repositories, Value Objects in `plan.md`.
**Constraint:** One migration per entity. No Eloquent calls outside Repositories.

---

### Step 5 — Nova Layer → `opscale-ui`

**Requires:** Domain classes from Step 4.
**Produces:** Resources, Filters, Lenses, Metrics, Nova Actions in `plan.md`.
**Constraint:** Nova Actions delegate entirely to an Opscale Action — zero business logic inline.

---

### Step 6 — Business Logic → `opscale-logic`

**Requires:** `process.md` (Step 3) + Business Rules from `spec.md` (Step 1).
**Produces:** One Opscale Action class per `action` task in the BPMN, listed in `plan.md`.
**Constraint:** One BPMN `action` task = one Opscale Action class. No exceptions.
Business logic that has no corresponding BPMN task does not belong in this module.

→ Run `/speckit.analyze` after Steps 4–6 to verify cross-artifact consistency before continuing.

---

### Step 7 — Outputs → `opscale-outputs`

**Requires:** `process.md` BPMN tasks of type `output`.
**Produces:** Output class contracts at `.specify/specs/{NNN}/contracts/`.
**Constraint:** One `output` task = one Output class = one delivery channel.

→ Run `/speckit.tasks` after this step to generate the ordered task breakdown.

---

### Step 8 — Debug Config → `opscale-debug`

**Requires:** `plan.md` from Steps 4–7.
**Produces:** Debug tooling configuration appended to `tasks.md`.
**Constraint:** Covers logs, Xdebug, Telescope/Ray setup — nothing that affects production behavior.

---

### Step 9 — Test Config → `opscale-test`

**Requires:** All Action stubs and Output contracts from Steps 6–7.
**Produces:** Test task entries in `tasks.md` — one test task per Action, preceding its implementation task.
**Constraint:** Test tasks always appear before their corresponding implementation task in `tasks.md`.
No implementation task is valid without a preceding test task.

---

### Step 10 — Release Config → `opscale-release`

**Requires:** Completed `tasks.md`.
**Produces:** CI/CD pipeline config, SonarQube setup, Semantic Release config.
**Constraint:** All quality gates defined in Article X must be wired into the pipeline.

---

→ Run `/speckit.implement` to hand off to Claude Code.

---

### Independent — Installer Skill → `opscale-ai`

**Not part of the sequence.** Runs independently after the project is built and published.
**Produces:** `.claude/skills/{package-slug}-setup.md` — a Claude Code skill that ships with
the package and guides its installation in a consuming application.
**Purpose:** Turn the README into an interactive setup conversation — ask config questions,
run migrations, create seeders, install complementary packages, verify everything works.

---

## III. Clean Architecture Layers

Every class belongs to exactly one layer. No class may contain logic from another layer.

```
app|src/
├── Console/Commands/
├── Contracts/
├── Events/
├── Exceptions/
├── Http/
│   ├── Controllers/API/
│   ├── Middleware/
│   ├── Requests/
│   └── Resources/
├── Jobs/
├── Listeners/
├── Models/
│   ├── Enums/
│   ├── Repositories/
│   └── ValueObjects/
├── Notifications/
├── Nova/
│   ├── Actions/
│   ├── Cards/
│   ├── Dashboards/
│   ├── Fields/
│   ├── Filters/
│   ├── Lenses/
│   ├── Menus/
│   ├── Metrics/
│   └── Repeaters/
├── Observers/
├── Policies/
├── Providers/
└── Services/
    └── Actions/          ← Opscale Actions (business logic units)
```

| Layer | Classes | Rule |
|-------|---------|------|
| **Representation** | Models | Define what domain entities ARE — no methods that compute or transform |
| **Communication** | Observers | Emit events when a model changes — no direct calls to other layers |
| **Transformation** | Services, Exceptions | Apply business rules — no HTTP, no Nova, no Eloquent queries |
| **Orchestration** | Jobs, Notifications | Coordinate multi-step processes — no inline business logic |
| **Interaction** | Console, Http, Nova, Policies | Entry points only — delegate immediately to Actions or Repositories |

**Communication direction:**
- **Downward** (request): via dependency injection — upper layers depend on interfaces, not implementations
- **Upward** (reaction): via Events and Listeners — a layer emits, listeners react independently
- **Forbidden**: Interaction layer calling Transformation directly without going through an Action

---

## IV. DDD Rules

DDD is applied pragmatically within Laravel. The goal is domain clarity, not framework purity.

### Subdomains as Packages
Each subdomain is an independent Laravel package. It owns its entities, repositories,
actions, and events. It never imports Eloquent models from another package.
Cross-subdomain communication uses only IDs and domain events.

### Aggregates
The aggregate root is the only entry point for modifying a cluster of related entities.
External code never modifies child entities directly — it always goes through the root.
Parent-child operations (create, update, delete) are wrapped in a single database transaction.

### Entities
Every entity uses a ULID as its primary key — not an auto-increment integer.
ULIDs are generated at the application layer, not the database layer.
Every entity table includes `id`, `created_at`, `updated_at`.
Soft deletes (`deleted_at`) are added only when the business requires the ability to
recover deleted records — not as a default safety net.

### Value Objects
Value Objects represent domain concepts that have no identity of their own (e.g., `Money`,
`Address`, `DateRange`). They are immutable — no setters, no mutators.
They are implemented as PHP classes and mapped to model columns via Laravel casts.
They are never stored as raw JSON or arrays in the database.

### Repositories
All database queries live in Repository classes. No Eloquent query builder calls exist
outside of Repositories. Models, Actions, Nova classes, and Controllers never call
`Model::where(...)` directly — they use a Repository method with a descriptive name.
Repository interfaces are defined in `Contracts/`. Implementations are in `Models/Repositories/`.

### Domain Logic
Domain classes (Models, Value Objects, Enums) contain only declarative property definitions
and cast configurations. No `if` statements, no loops, no computations inside domain classes.
All conditional logic belongs in Actions or Domain Services.

### Domain Services
Used only when a business operation spans multiple aggregate roots within the same subdomain
and cannot be owned by a single aggregate. Domain Services are stateless and receive all
dependencies via constructor injection.

---

## V. Opscale Actions (Business Logic Units — NON-NEGOTIABLE)

Business logic lives exclusively in **Opscale Actions** (`Services/Actions/`).
Built on [lorisleiva/laravel-actions](https://github.com/lorisleiva/laravel-actions).
Using any other class type for business logic is a violation of this constitution.

**Each Action must:**
- Represent exactly one business operation — one reason to exist
- Use `declare(strict_types=1)`
- Receive typed input: a DTO, Value Object, or typed primitive — never `array` or `$request`
- Return typed output — never `void` unless the side effect is the explicit contract
- Be testable in complete isolation: no HTTP context, no Nova, no seeded database required

**Each Action may be invoked as:**
- An HTTP Controller action (via `AsController`)
- An Artisan Command (via `AsCommand`)
- A queued Job (via `AsJob`)
- An Event Listener (via `AsListener`)

This eliminates wrapper classes and duplication. One Action class serves all invocation contexts.

**Mapping:** One BPMN `action` task = one Opscale Action class.
If a BPMN task requires two Action classes, it should be split into two tasks.

---

## VI. Nova Layer Rules

Nova is the Interaction layer. It contains zero business logic.

- **Resources**: one per aggregate root. Fields map directly to entity attributes.
  Computed or derived values are never inline in fields — they belong in Metrics or Lenses.
- **Nova Actions**: thin wrappers only. They collect user input and confirmation, then
  call one Opscale Action. If a Nova Action contains an `if` statement, it is wrong.
- **Filters**: query refinements based on domain states or entity attributes.
  They use Repository methods — not raw Eloquent scopes inline.
- **Lenses**: alternative views of an aggregate (e.g., pending approvals, flagged records).
  Always sourced from a Repository method — never from raw Eloquent in the Lens class.
- **Metrics**: computed domain insights (counts, trends, averages).
  Sourced from Repository methods or dedicated read models.

---

## VII. Outputs (Meaningful Delivery)

Any information leaving the system — email, push notification, PDF, WhatsApp, webhook,
external API call — is an Output class. Never inline in an Action or Controller.

- Output classes live in `Notifications/` (for Laravel Notification channels) or `Jobs/`
  (for async generation like PDFs or reports).
- Each Output class handles exactly one delivery channel.
  Multi-channel delivery uses separate Output classes, one per channel.
- Outputs are dispatched as queued jobs whenever the operation could take more than 200ms.
- When `[TENANT_AWARE]` is `yes`, channel configuration (addresses, API keys, preferences)
  is resolved per tenant at dispatch time.
- One BPMN `output` task = one Output class.

---

## VIII. SOLID Rules

All PHP files use `declare(strict_types=1)`. PHPStan runs at level 8.

**Single Responsibility**
Every class has one reason to change. A class that handles HTTP input, applies business
rules, and sends notifications violates SRP. Keep classes small and focused.
If a class exceeds ~150 lines, it likely has more than one responsibility.

**Open/Closed**
Classes are extended through interfaces and composition, not by modifying existing methods.
Overriding a parent method to change its behavior (not extend it) is a violation.
Use interfaces and dependency injection to vary behavior.

**Liskov Substitution**
A subclass must be usable wherever its parent is expected without changing system behavior.
When overriding a parent method, always call `parent::method()` unless the override is
a complete, intentional replacement documented as such.

**Interface Segregation**
Interfaces must be narrow and specific. A class that implements an interface but leaves
methods empty or throwing `NotImplementedException` means the interface is too broad.
Split it.

**Dependency Inversion**
High-level classes depend on interfaces, not concrete implementations.
Never instantiate dependencies with `new ClassName()` inside a class body.
All dependencies are injected via constructor. The service container resolves them.

---

## IX. Multi-Tenancy

**Tenant Aware: [TENANT_AWARE]**

When `yes`:
- Every domain table includes a `tenant_id` column: non-nullable, indexed, no FK constraint.
- Tenant scoping is enforced at the Repository layer — every query method applies a
  `where('tenant_id', ...)` condition. This is never skipped silently.
- Nova Resources scope `indexQuery` and `detailQuery` by tenant.
- Cross-tenant administrative queries are explicit, documented, and restricted to
  system-level commands — never exposed through Nova or API endpoints.

When `no`:
- Document the business reason this module does not require tenant isolation.

---

## X. Code Quality Gates

No feature branch merges without passing all of the following:

### All project types (app, module, package, library)

1. ✅ PHPStan level 8 — zero errors across all four rule sets
2. ✅ Duster lint — PHP + JavaScript/Vue clean
3. ✅ All tests pass (Unit, Feature, Web where applicable)
4. ✅ SonarQube quality gate — no new critical or blocker issues
5. ✅ Semantic Release commit convention on all commits

### App and module only (not package or library)

6. ✅ DBML (`data-model.md`) matches actual migrations — zero drift
7. ✅ Every BPMN `action` task maps to an implemented Opscale Action — no orphan tasks

---

## XI. Spec-Driven Development Sequence

Every module follows this sequence without skipping steps:

```
opscale-process   →  .specify/specs/{NNN}/spec.md          (what & why — no tech)
opscale-dbml      →  .specify/specs/{NNN}/data-model.md    (DBML — authoritative)
opscale-bpmn      →  .specify/specs/{NNN}/process.md       (BPMN task map)
                      /speckit.clarify                      (validate before planning)
opscale-domain    ↘
opscale-ui      →  .specify/specs/{NNN}/plan.md          (how — tech decisions)
opscale-logic     ↗
opscale-outputs   →  .specify/specs/{NNN}/contracts/       (output contracts)
                      /speckit.analyze                      (cross-artifact consistency)
                      /speckit.tasks                        (ordered task breakdown)
opscale-debug     ↘
opscale-test      →  .specify/specs/{NNN}/tasks.md         (test tasks before impl tasks)
opscale-release   ↗
                      /speckit.implement                    (Claude Code builds it)

# Independent (not part of the sequence):
opscale-ai        →  .claude/skills/{slug}-setup.md        (installer skill for consumers)
```

- `spec.md` — what and why, zero technical details, readable by a business owner
- `data-model.md` — authoritative DBML, all migrations generated from it
- `process.md` — BPMN task map, every task typed as `crud`, `action`, or `output`
- `plan.md` — tech decisions, file paths, class names
- `tasks.md` — test tasks always precede their implementation counterpart
- No implementation task starts without a completed, validated spec and plan

---

## Governance

- This constitution supersedes all other instructions, templates, and conventions.
- Any deviation requires explicit inline documentation with the business or technical reason.
- Amendments must propagate to all dependent `.specify/templates/` files.
- PRs violating any article are blocked until resolved — no exceptions.
