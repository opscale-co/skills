# Opscale Project Constitution

**Project:** [PROJECT_NAME]
**Project Type:** [PROJECT_TYPE]
**Module Prefix:** [MODULE_PREFIX]
**App Locale:** [APP_LOCALE]
**Workbench Locale:** [WORKBENCH_LOCALE]
**Created:** [DATE]

> This constitution is the architectural DNA of every Opscale project.
> Claude Code MUST read and comply with it before generating any code, spec, plan, or task.
> It is derived from [opscale-co/strict-rules](https://github.com/opscale-co/strict-rules)
> and supersedes all other instructions. Deviations require explicit documentation.

---

## 0. Project Type

**Type: [PROJECT_TYPE]** — locked at `opscale-init` time. The skill prompts for one of `app` / `module` / `package` / `library` and substitutes the value into this constitution. The choice is permanent for the project; changing it after the fact requires re-running `opscale-init`.

| Type | Description | Example |
|------|-------------|---------|
| `app` | Complete Laravel Nova application containing multiple modules. Deployed via Vapor or similar. | A multi-module SaaS platform |
| `module` | Single bounded-context package within an app. Handles one business subdomain. | `opscale-co/nova-loan-module` |
| `package` | Standalone project with specific functionality. Can have domain, Nova resources, Actions. Published to Packagist. | `nova-api`, `nova-authorization` |
| `library` | Pure utility/infrastructure code. No domain, no Nova, no Actions. | `opscale-co/strict-rules`, `opscale-co/actions` |

### Type-specific notes

- **`library`** — skip the spec, DBML, BPMN, SIPOC, domain, Nova, logic, outputs, and AI steps. Sequence collapses to: write code → `opscale-test` → `opscale-release`. Quality gates (§VIII) still apply in full.
- **`app`** — container for multiple modules; each module follows the full sequence independently. Cross-module communication uses domain events and IDs only, never direct imports.
- **`package` vs `module`** — same sequence, different context. A **module** is a bounded context within a larger application (one business subdomain). A **package** is a standalone project that can be used across applications (API tooling, dashboards, authorization).

Per-skill applicability matrix: `README.md` (Skills → Development Sequence). Joining an existing project: `opscale-init`'s `SKILL.md`.

---

## I. Design Methodology — sequence constraints

Follow the skill sequence strictly. Each skill declares its own prerequisites and outputs in its `SKILL.md`. Canonical artifact paths: `skills/opscale-init/references/artifact-paths.md`. The constitution only enforces the **per-step constraint** that downstream skills (and reviewers) rely on:

| Step | Skill | Constitutional constraint |
|------|-------|---------------------------|
| 1 | `opscale-process` | No technical terminology — readable by a business owner. |
| 2 | `opscale-dbml` | Business entities only; the DBML is the authoritative source — all code generates from it, never the reverse. |
| 3 | `opscale-bpmn` | Every task references a DBML entity; no new domain concepts may be introduced. Every task classified as exactly one of `crud` / `action` / `output`. |
| 4 | `opscale-sipoc` | One SIPOC per BPMN `businessRuleTask`; the SIPOC re-states what's in spec+DBML+BPMN — never invents. |
| 5 | `opscale-domain` | One migration per entity. No Eloquent calls outside Repositories. |
| 6 | `opscale-ui` | Nova Actions delegate to Opscale Actions — zero business logic inline. |
| 7 | `opscale-logic` | One BPMN `action` task = one Opscale Action class. No exceptions. Business logic with no BPMN task does not belong in the module. |
| 8 | `opscale-outputs` | One `output` task = one Output class = one delivery channel. |
| 9 | `opscale-debug` | Debug tooling (logs, Xdebug, Telescope/Ray) is configured for local + staging only. Nothing in debug config affects production behavior. |
| 10 | `opscale-test` | Test tasks always precede implementation tasks in `tasks.md`. No implementation task is valid without a preceding test task. |
| 11 | `opscale-release` | All §VIII quality gates wired into the CI pipeline. |

Spec-kit checkpoints: `/speckit.clarify` after Step 3, `/speckit.analyze` after Steps 4–6, `/speckit.tasks` after Step 7, `/speckit.implement` after Step 11.

### Independent — Installer Skill → `opscale-ai`

Not part of the sequence. Runs after the project is published. Produces `.claude/skills/{package-slug}-setup.md` — an installer skill that guides a consuming application through configuration, migrations, seeders, and verification.

---

## II. Clean Architecture Layers

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

## III. DDD Rules

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

## IV. Opscale Actions (Business Logic Units — NON-NEGOTIABLE)

Business logic lives exclusively in **Opscale Actions** (`Services/Actions/`).
Built on [lorisleiva/laravel-actions](https://github.com/lorisleiva/laravel-actions).
Using any other class type for business logic is a violation of this constitution.

**Each Action must:**
- Represent exactly one business operation — one reason to exist
- Use `declare(strict_types=1)`
- Receive typed input: **primitives, `array`, or Model classes only** — never `$request`, no DTOs, no Value Objects in the signature
- Return typed output — never `void` unless the side effect is the explicit contract
- Be testable in complete isolation: no HTTP context, no Nova, no seeded database required

**Each Action may be invoked as:**
- An HTTP Controller action (via `AsController`)
- An Artisan Command (via `AsCommand`)
- A queued Job (via `AsJob`)
- An Event Listener (via `AsListener`)

This eliminates wrapper classes and duplication. One Action class serves all invocation contexts.

---

## V. Nova Layer Rules

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

## VI. Outputs (Meaningful Delivery)

Any information leaving the system — email, push notification, PDF, WhatsApp, webhook,
external API call — is an Output class. Never inline in an Action or Controller.

- Output classes live in `Notifications/` (for Laravel Notification channels) or `Jobs/`
  (for async generation like PDFs or reports).
- Each Output class handles exactly one delivery channel.
  Multi-channel delivery uses separate Output classes, one per channel.
- Outputs are dispatched as queued jobs whenever the operation could take more than 200ms.
- One BPMN `output` task = one Output class.

---

## VII. SOLID Rules

All PHP files use `declare(strict_types=1)`. PHPStan runs at level 8 (also enforced by §VIII).

- **Single Responsibility** — one reason to change per class. Classes that touch HTTP input + business rules + notifications violate SRP; split them.
- **Open/Closed** — extend through interfaces and composition. Overriding a parent method to *change* (not extend) its behavior is a violation.
- **Liskov Substitution** — a subclass must work wherever its parent is expected. Always call `parent::method()` unless the override is a documented, intentional replacement.
- **Interface Segregation** — narrow, specific interfaces. Empty implementations or `NotImplementedException` mean the interface is too broad — split it.
- **Dependency Inversion** — high-level classes depend on interfaces. Constructor injection only.

---

## VIII. Code Quality Gates

No feature branch merges without passing all of the following:

### All project types (app, module, package, library)

1. ✅ PHPStan level 8 — zero errors across all four rule sets
2. ✅ Duster lint — PHP + JavaScript/Vue clean
3. ✅ All tests pass (Unit, Feature, Web where applicable)
4. ✅ SonarQube quality gate — no new critical or blocker issues
5. ✅ Semantic Release commit convention on all commits

### App and module only (not package or library)

6. ✅ DBML (`docs/plan/domain.dbml`) matches actual migrations — zero drift
7. ✅ Every BPMN `action` task maps to an implemented Opscale Action — no orphan tasks

---

## IX. Spec-Driven Development Sequence

Canonical sequence + artifact paths: `skills/opscale-init/references/artifact-paths.md`. Prose summary: `README.md`. Per-step constraints: §I of this document.

No implementation task starts without a completed, validated spec and plan.

---

## Governance

- This constitution supersedes all other instructions, templates, and conventions.
- Any deviation requires explicit inline documentation with the business or technical reason.
- Amendments must propagate to all dependent `.specify/templates/` files.
- PRs violating any article are blocked until resolved — no exceptions.
