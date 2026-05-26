## Support us

Support Opscale

At Opscale, we're passionate about contributing to the open-source community by providing solutions that help businesses scale efficiently. If you've found our tools helpful, here are a few ways you can show your support:

⭐ **Star this repository** to help others discover our work and be part of our growing community. Every star makes a difference!

💬 **Share your experience** by leaving a review on [Trustpilot](https://www.trustpilot.com/review/opscale.co) or sharing your thoughts on social media. Your feedback helps us improve and grow!

📧 **Send us feedback** on what we can improve at [feedback@opscale.co](mailto:feedback@opscale.co). We value your input to make our tools even better for everyone.

🙏 **Get involved** by actively contributing to our open-source repositories. Your participation benefits the entire community and helps push the boundaries of what's possible.

💼 **Hire us** if you need custom dashboards, admin panels, internal tools or MVPs tailored to your business. With our expertise, we can help you systematize operations or enhance your existing product. Contact us at hire@opscale.co to discuss your project needs.

Thanks for helping Opscale continue to scale! 🚀

## Description

Claude Code skills and subagents for building Laravel projects with a structured, spec-driven workflow. Works with new and existing projects.

This workflow is built around Claude Code harness best practices: dividing work into specialized skills and subagents, each with a focused scope and limited tools, to maximize precision and reduce hallucination. Instead of one monolithic prompt, the harness orchestrates small, composable units that do one thing well. For architecture, it follows the conventions already defined by [Opscale](https://github.com/opscale-co) for Laravel + Nova projects. For methodology, it implements [spec-driven development](https://github.com/spec-driven) — artifacts are validated before any code is generated.

## How It Works

The harness splits every project into three phases plus an iteration loop. Each phase is a group of skills that orchestrate specialized subagents. No phase starts until the previous one is validated. A handful of **finishing skills** can be invoked alongside any phase to polish the workbench experience.

```
init  →  Plan  →  Generate  →  Review
                                   ↺ Iterate (after the loop is complete)

Finishing (invoke as needed): opscale-seed · opscale-menu · opscale-showcase
```

### init — once per project

Skill: `opscale-init`

Assumes you are inside an **existing PHP/Laravel project** (refuses if `composer.json` is missing). Installs spec-kit, configures MCP servers, writes the Opscale constitution, and establishes the per-module `docs/` convention. Every other skill checks `.specify/memory/constitution.md` exists before running.

### Plan — understand before building (strict order)

Skills: `opscale-process` → `opscale-dbml` → `opscale-bpmn`

The planning phase produces validated spec artifacts — not code. Each skill takes informal input, structures it, spawns validator subagents, and only advances when the artifact passes. The three skills run **in order**; each declares its predecessor as a hard prerequisite.

- **Process** — business spec from informal input. Writes `spec.md` (structured) AND `docs/process.md` (the original narrative, preserved verbatim).
- **DBML** — DDD-aligned data model. Writes `data-model.md` (live) AND `docs/initial.dbml` (frozen snapshot, never overwritten).
- **BPMN** — process map. Writes `process.md` (live) AND `docs/initial.bpmn` (frozen snapshot).

Every artifact is cross-validated: the BPMN references only entities from the DBML, the DBML traces back to the spec. Nothing is invented.

### Generate — deterministic code from validated artifacts (strict order)

Skills: `opscale-domain` → `opscale-ui` → `opscale-logic`

Each Generate skill first drives **spec-kit `/speckit.plan` + `/speckit.tasks`** to record one task per unit, then spawns parallel agents to produce the code. Generation is deterministic and traceable: every generated file maps back to a tasks.md entry.

| Skill | Unit | One task per | Bundle contents |
|-------|------|--------------|-----------------|
| **Domain** | Entity bundle | DBML entity | migration + model + repository trait + owned enums + owned VOs |
| **UI** | Aggregate bundle | Aggregate root | Resource + Repeatable + shared Fields trait |
| **Logic** | Action | BPMN `businessRuleTask` | one SIPOC under `docs/actions/` + one Opscale Action class whose `handle()` materializes the SIPOC Process steps |

Every implementation task is preceded by a `Test {X}` task — `opscale-test` later fills the test body. There is no cap on entities/aggregates/Actions; large modules split into sequential batches of ~20 agents.

Package projects enter directly here — the user provides definitions instead of spec artifacts. The same subagents run with the same contracts.

### Review — quality gates before shipping (flexible order, except test → release)

Skills: `opscale-debug`, `opscale-test`, `opscale-release`

Review skills can be invoked at **any point after `opscale-init`** — you don't have to finish Plan or Generate first. The only ordering constraint inside Review is: `release` always runs after `test`.

- **Debug** — Xdebug + Telescope for local/staging only (never production)
- **Test** — configures the stack (Pest, Dusk, PHPStan, Duster, Rector) AND **generates the tests**: Unit (domain), Feature (Actions, real DB), Browser (Nova UI smoke). Headless by default. `composer run build` + `composer run serve` mandatory.
- **Release** — Semantic Release, commitlint, Husky, SonarQube, four GitHub Actions workflows. Refuses to run unless `tests/` is populated.

### Finishing — polish the workbench experience (invoke any time)

Skills: `opscale-seed`, `opscale-menu`, `opscale-showcase`

Finishing skills are independent of the strict sequence — invoke whichever you need, whenever you need it, as long as their own prerequisites are met.

- **Seed** — generates a coherent workbench `DatabaseSeeder` (catalogs + one tenant + one agency + one open day + one funded drawer + one demo transaction). Required before Browser tests can open detail pages. Runs after `opscale-domain`.
- **Menu** — introspects `src/Nova/` and groups aggregate Resources into sections (Day Lifecycle, Operations, Control, Catalogs…) by writing the `MenuSection` block into `workbench/app/Providers/NovaServiceProvider.php`. Runs after `opscale-ui`.
- **Showcase** — generates a **non-headless** guided Dusk test that walks the whole Nova flow (login → dashboard → every aggregate → seeded detail → create form) with a configurable pause before each main action. Stakeholder-ready visual validation. Runs after `opscale-test` + `opscale-seed`.

### Iterate — adding the next feature once the module is complete

Skill: `opscale-iterate`

Single command that takes a **user story** (`As X / I want Y / So that Z` + Given/When/Then), drives spec-kit through specify/clarify/plan/tasks/analyze, surgically invokes only the Opscale skills the diff requires, runs the quality gates, and closes with **one Conventional Commits commit** compatible with semantic-release.

Strict gate: refuses to run unless the **initial pipeline is complete** (Plan + Generate done) AND **zero pending tasks** in `tasks.md`. Iteration extends a finished module; it does not finish a half-built one.

Every iteration is archived as `docs/iterations/YYYY-MM-DD-<slug>.md` inside the target module's spec folder — a permanent dated record alongside the frozen `docs/initial.dbml` / `docs/initial.bpmn` snapshots.

## Project Types

| Type | Description | Pipeline | Example |
|------|-------------|----------|---------|
| `app` | Complete Laravel Nova application with many modules | Full spec-driven (per module) | A multi-module SaaS platform |
| `module` | Bounded-context package within an app | Full spec-driven | `opscale-co/nova-loan-module` |
| `package` | Standalone project with specific functionality | Direct (domain/ui/logic without specs) | `nova-api`, `nova-authorization` |
| `library` | Pure utility/infrastructure code | Test + release only | `opscale-co/strict-rules` |

### Development Sequences

```
app / module    init → plan → generate → review → (iterate)*
package         init → generate → review → (iterate)*
library         init → review
```

**app/module** get the full pipeline: plan the spec artifacts, generate code from them, review with quality gates. **package** skips the planning phase — definitions are provided directly. **library** has no generation phase — just code, tests, and release.

`iterate` is the loop that runs after the initial pipeline closes — only valid when every prior task is complete and the tree is clean.

## New and Existing Projects

The workflow is designed for both greenfield and existing codebases.

### New Projects

Run `opscale-init`, then follow the sequence from step 1. Each step produces a validated artifact that the next step depends on.

### Existing Projects

`opscale-init` scans the existing code structure — models, migrations, Nova resources, Actions, tests — and recommends where to join the sequence:

| What already exists | Recommended entry point |
|---------------------|------------------------|
| Nothing | Step 1: `opscale-process` |
| Business docs but no code | Step 1: `opscale-process` (formalize into spec) |
| Models + migrations but no spec | Step 1: `opscale-process` (reverse-document what exists) |
| Full domain + Nova but no tests | Step 8: `opscale-test` |
| Everything, adopting conventions | Run `constitution-enforcer` to assess |

Generation agents detect existing files at every target path:
- **Identical** → skip
- **Existing file has additions** → merge, preserving custom code
- **Conflict** → flag for review, never silently overwrite

Existing code is the source of truth until the spec catches up. Adoption can be incremental — one module at a time.

## Installer Skill (`opscale-ai`)

Separate from the development sequence. `opscale-ai` generates a Claude Code skill that ships with the project and guides its installation in a consuming application — an interactive version of the README.

When a consumer installs the package, instead of reading the README they invoke the skill and Claude Code walks them through everything:
- Asks the right questions for each config value
- Runs migrations and verifies the schema
- Creates seeders with appropriate data when needed
- Installs and configures complementary packages (with confirmation)
- Sets environment variables
- Registers Nova resources if applicable
- Runs a verification checklist at the end

## Architecture

```
skills/        → 15 skills (orchestrators — own workflow and user dialogue)
  └─ opscale-{domain,ui,logic}/
       scripts/   → deterministic Node.js generators (.mjs)
       templates/ → mustache-lite PHP templates (.php.tmpl)
agents/        → 24 agents (execution units — own parallelizable work)
```

Skills manage the sequence, interact with the user, and spawn agents. Agents do the actual work — generating files, running validators, checking gates — in parallel where possible. Agents receive normalized input from the skill and generate code independently.

### Deterministic code generation

For the Generate phase (`domain`, `ui`, `logic`), file generation is fully deterministic. Each generator agent (`enum-generator`, `model-generator`, `resource-generator`, `action-generator`, etc.) is a thin wrapper that runs a Node.js script (`scripts/generate-*.mjs`) which renders a PHP template (`templates/*.php.tmpl`) from a JSON payload the skill normalized.

| What the skill does | What the script does |
|---------------------|---------------------|
| Normalizes DBML/BPMN into the JSON contract for each generator | Renders the matching template with a tiny mustache-lite engine |
| Resolves naming, ordering, conflict-free relation method names | Maps Nova field types, Eloquent relation return types, enum imports |
| Decides what gets a Tab, what's a Badge, what's a Repeatable | Wraps every user-visible string in `__()` automatically |
| Picks the JSON `field` per column (Text/Select/BelongsTo/…) | Writes the file with a uniform conflict policy |

The JSON contract for each generator lives in the header comment of its `.mjs` file. The PHP grammar lives in the matching `.tmpl` file. Nothing else.

**Conflict policy (uniform across all 9 generators):**

| Situation | Outcome |
|-----------|---------|
| Target file missing | `WRITTEN` |
| Target exists and is byte-identical (after newline normalization) | `SKIPPED` |
| Target exists and differs | `CONFLICT` — writes `<target>.opscale-preview` next to it, leaves the real file untouched. The skill surfaces the diff to the user. |

No silent overwrites. No automatic merging.

### Per-module `docs/` convention

Every module folder under `.specify/specs/{NNN}-{slug}/` contains a `docs/` subfolder that captures the human-readable history of the module:

```
.specify/specs/{NNN}-{module-name}/
├── spec.md             ← structured spec (live, evolves)
├── data-model.md       ← DBML wrapped in narrative (live)
├── process.md          ← BPMN process map (live)
├── plan.md             ← tech decisions (live)
├── tasks.md            ← ordered task ledger (live)
└── docs/               ← human-readable history (frozen + append-only)
    ├── process.md      ← original narrative from opscale-process
    ├── initial.dbml    ← frozen DBML snapshot — never overwritten
    ├── initial.bpmn    ← frozen BPMN snapshot — never overwritten
    ├── actions/        ← SIPOC per Action (BPMN-driven only)
    │   └── <kebab-id>.sipoc.md   ← Suppliers/Inputs/Process/Outputs/Customers
    └── iterations/
        └── YYYY-MM-DD-<slug>.md   ← one file per opscale-iterate run
```

**Live vs. frozen:** the top-level artifacts evolve with every iteration. `docs/` is the historical baseline — initial snapshots never change, iteration files are written once and never edited. This is what future maintainers read to understand how the module grew.

### Orchestration gates

| Skill | Required before it runs | Order |
|-------|------------------------|:-----:|
| `opscale-init` | composer.json + Laravel detected | Bootstrap |
| `opscale-process` | init | Plan #1 (strict) |
| `opscale-dbml` | init + process | Plan #2 (strict) |
| `opscale-bpmn` | init + process + dbml | Plan #3 (strict) |
| `opscale-domain` | init + Plan complete | Generate #1 (strict) |
| `opscale-ui` | init + Plan + domain | Generate #2 (strict) |
| `opscale-logic` | init + Plan + domain + ui | Generate #3 (strict) |
| `opscale-debug` | init | Review (any order) |
| `opscale-test` | init | Review (any order) |
| `opscale-release` | init + opscale-test produced test files | Review (after test) |
| `opscale-seed` | init + domain + workbench User model | Finishing (any time after Generate #1) |
| `opscale-menu` | init + ui + workbench NovaServiceProvider | Finishing (any time after Generate #2) |
| `opscale-showcase` | init + ui + seed + test (Dusk infra) | Finishing (after Review test) |
| `opscale-iterate` | init + Plan + Generate + **0 pending tasks** + clean git | After full pipeline |
| `opscale-ai` | init + at least one shipped package | Independent |

### MCP Servers

Agents use three MCP servers configured by `opscale-init`:

| Server | Used by | Purpose |
|--------|---------|---------|
| `sequential-thinking` | Code generation agents | Step-by-step reasoning for complex logic implementation |
| `sqlite` | Test and quality agents | Structured test results and coverage tracking |
| `memory` | All agents | Persistent knowledge graph across sessions |

### Skills

#### Development Sequence

| Step | Skill | Purpose | app | module | package | library |
|------|-------|---------|:---:|:------:|:-------:|:-------:|
| 0 | `opscale-init` | Bootstrap scaffold, constitution, MCP servers, `docs/` convention. Refuses if not inside a Laravel/PHP project | Yes | Yes | Yes | Yes |
| 1 | `opscale-process` | Business spec from informal input + narrative in `docs/process.md` | Per module | Yes | -- | -- |
| 2 | `opscale-dbml` | DDD-aligned DBML + frozen `docs/initial.dbml` snapshot | Per module | Yes | -- | -- |
| 3 | `opscale-bpmn` | BPMN 2.0 process map + frozen `docs/initial.bpmn` snapshot | Per module | Yes | -- | -- |
| 4 | `opscale-domain` | Spec-kit plan + tasks (one per entity bundle), then models/migrations/enums/VOs/repos. No entity cap | Per module | Yes | Yes | -- |
| 5 | `opscale-ui` | Spec-kit plan + tasks (one per aggregate bundle), then Resources + Repeatables + Field traits | Per module | Yes | Yes | -- |
| 6 | `opscale-logic` | SIPOC per Action under `docs/actions/`, spec-kit plan + tasks (one per Action), then Opscale Actions whose `handle()` body is derived from the SIPOC Process section | Per module | Yes | Yes | -- |
| 7 | `opscale-debug` | Xdebug + Telescope (local/staging only) | Yes | Yes | Yes | Optional |
| 8 | `opscale-test` | Stack config (Pest, Dusk, PHPStan, Duster, Rector) + workbench seeders + **generates Unit/Feature/Browser tests**. Headless by default. `composer build`/`serve` | Yes | Yes | Yes | Yes |
| 9 | `opscale-release` | Semantic Release, commitlint, Husky, SonarQube, GitHub Actions. Refuses without test files | deploy-app | publish-package | publish-package | publish-package |

#### Finishing

Independent of the strict sequence — invoke whenever the workbench needs polishing.

| Skill | Purpose | app | module | package | library |
|-------|---------|:---:|:------:|:-------:|:-------:|
| `opscale-seed` | Coherent workbench `DatabaseSeeder`: catalogs + tenant + agency + open day + funded drawer + demo transaction. Unblocks Browser tests and gives `testbench serve` something to render | Per module | Yes | Yes | -- |
| `opscale-menu` | Groups `src/Nova/*` aggregates into `MenuSection`s inside `workbench/app/Providers/NovaServiceProvider.php` so the sidebar reads the way an operator would navigate | Per module | Yes | Yes | -- |
| `opscale-showcase` | Non-headless guided Dusk test that walks the whole Nova flow with configurable pauses — stakeholder-ready visual validation | Per module | Yes | Yes | -- |

#### Iterative

| Skill | Purpose | app | module | package | library |
|-------|---------|:---:|:------:|:-------:|:-------:|
| `opscale-iterate` | User-story → spec-kit plan/tasks → surgical re-run of affected skills → quality gates → one Conventional Commits commit. Archives every iteration as `docs/iterations/YYYY-MM-DD-<slug>.md`. Refuses on incomplete modules or pending tasks | Per module | Yes | Yes | -- |

#### Independent

| Skill | Purpose | app | module | package | library |
|-------|---------|:---:|:------:|:-------:|:-------:|
| `opscale-ai` | Generate installer skill for consuming apps | -- | Yes | Yes | Yes |

### Agents

#### Validation (app, module)

Require spec documentation artifacts (spec.md, data-model.md, process.md).

| Agent | Spawned by | Purpose |
|-------|-----------|---------|
| `dbml-validator` | opscale-dbml | Runs validate-dbml.mjs, returns pass/fail |
| `bpmn-validator` | opscale-bpmn | Runs validate-bpmn.mjs, returns pass/fail |
| `spec-consistency-checker` | opscale-bpmn | Cross-references spec / DBML / BPMN |

#### Domain Generation (app, module, package)

All deterministic wrappers — each runs the matching `scripts/generate-*.mjs` against `templates/*.php.tmpl`. Parallelizable.

| Agent | Spawned by | Script | Unit |
|-------|-----------|--------|------|
| `enum-generator` | opscale-domain | `generate-enum.mjs` | One per enum |
| `value-object-generator` | opscale-domain | `generate-value-object.mjs` | One per VO |
| `migration-generator` | opscale-domain | `generate-migration.mjs` | One per entity |
| `model-generator` | opscale-domain | `generate-model.mjs` | One per entity |
| `repository-generator` | opscale-domain | `generate-repository.mjs` | One per model (trait with scopes + boot hooks) |

#### Nova Generation (app, module, package)

| Agent | Spawned by | Script | Unit |
|-------|-----------|--------|------|
| `resource-generator` | opscale-ui | `generate-resource.mjs` | One per aggregate root |
| `field-trait-generator` | opscale-ui | `generate-field-trait.mjs` | One per aggregate |
| `repeatable-generator` | opscale-ui | `generate-repeatable.mjs` | One per nested collection |

#### Logic Generation (app, module, package)

| Agent | Spawned by | Script | Unit |
|-------|-----------|--------|------|
| `action-generator` | opscale-logic | `generate-action.mjs` | One per Action |

#### Test Generation

| Agent | app | module | package | library | What it tests |
|-------|:---:|:------:|:-------:|:-------:|---------------|
| `unit-test-generator` | Yes | Yes | Yes | -- | VOs, enums, models, repos, schema consistency |
| `feature-test-generator` | Yes | Yes | Yes | -- | Actions with real DB, events, side effects |
| `web-test-generator` | Yes | Yes | Yes | -- | Complete user flow through Nova UI |
| `support-test-generator` | -- | -- | -- | Yes | Traits, services, helpers, rules, abstracts |
| `quality-runner` | Yes | Yes | Yes | Yes | PHPStan level 8, Duster, Pest |

#### Release

| Agent | Spawned by | Unit |
|-------|-----------|------|
| `workflow-generator` | opscale-release | One per GitHub Actions workflow |
| `release-config-generator` | opscale-release | All configs (.releaserc, commitlint, husky, sonar, etc.) |

#### Installer

| Agent | Spawned by | Purpose |
|-------|-----------|---------|
| `ai-config-generator` | opscale-ai | Reads project surface, generates installer skill that ships with the package |

#### Cross-Cutting

| Agent | app | module | package | library | Purpose |
|-------|:---:|:------:|:-------:|:-------:|---------|
| `constitution-enforcer` | Yes | Yes | Yes | Partial | Code vs constitution rules |
| `support-enforcer` | -- | -- | -- | Yes | strict_types, type safety, structure |
| `traceability-auditor` | Yes | Yes | -- | -- | Verifies spec → DBML → Model → Action chain |
| `gate-checker` | Yes | Yes | Yes | test+release | Completeness checklist per step |

### Examples

#### app/module — `opscale-domain` with 8 entities

```
opscale-domain (skill — orchestrates)
  ├─ Reads DBML, presents inventory (no cap on entity count)
  ├─ Drives /speckit.plan + /speckit.tasks → 8 entity bundle tasks (1 per entity)
  ├─ Spawns 4x enum-generator              (parallel)
  ├─ Spawns 2x value-object-generator      (parallel)
  ├─ Spawns 8x migration-generator         (dependency order)
  ├─ Spawns 8x model-generator             (parallel)
  ├─ Spawns 8x repository-generator        (parallel)
  ├─ Spawns 1x gate-checker                (sequential)
  └─ Spawns 1x constitution-enforcer       (sequential)
```

For very large models (>20 entities), each phase splits into sequential batches of ~20 parallel agents — no entity is ever dropped.

#### Iteration — `opscale-iterate` adds a feature to a finished module

```
opscale-iterate (skill — orchestrates)
  ├─ Gate: init + Plan + Generate complete + 0 pending tasks + clean git
  ├─ Collects user story (As X / I want Y / So that Z + Given/When/Then)
  ├─ Archives docs/iterations/YYYY-MM-DD-<slug>.md
  ├─ Drives /speckit.specify → clarify → plan → tasks → analyze
  ├─ Reads tasks.md and invokes ONLY the Opscale skills the diff requires
  │     (e.g. dbml + domain + ui + test — never the full pipeline)
  ├─ Runs composer run check (+ test:web if Nova changed)
  └─ Creates one Conventional Commits commit on iter/<slug> branch
```

#### library — `opscale-test` with 6 classes

```
opscale-test (skill — orchestrates)
  ├─ Spawns 6x support-test-generator  (parallel)
  ├─ Spawns 1x support-enforcer        (sequential)
  ├─ Spawns 1x quality-runner          (sequential)
  └─ Spawns 1x gate-checker            (sequential)
```

## Installation

Symlink all skills into Claude Code's default skills directory:

```bash
mkdir -p ~/.claude/skills
for skill in /path/to/opscale/skills/skills/opscale-*; do
  ln -s "$skill" ~/.claude/skills/$(basename "$skill")
done
```

Skills are discovered automatically — no `settings.json` changes needed. Symlinks keep everything in sync with the repo.

## Usage

Each skill is invoked as a Claude Code slash command inside the target project directory:

```
/opscale-init          # bootstrap an existing Laravel/PHP project
/opscale-process       # generate business spec + docs/process.md from informal input
/opscale-dbml          # generate data model + frozen docs/initial.dbml
/opscale-bpmn          # generate process map + frozen docs/initial.bpmn
/opscale-domain        # plan + tasks per entity, then generate domain layer
/opscale-ui            # plan + tasks per aggregate, then generate Nova layer
/opscale-logic         # plan + tasks per Action, then generate Opscale Actions
/opscale-debug         # Xdebug + Telescope (local/staging)
/opscale-test          # configure stack AND generate Unit/Feature/Browser tests
/opscale-release       # semantic-release + CI/CD + SonarQube
/opscale-seed          # workbench DatabaseSeeder (catalogs + happy-path instance)
/opscale-menu          # group Nova Resources into sidebar sections
/opscale-showcase      # non-headless guided Dusk walkthrough of the module
/opscale-iterate       # add the next feature via user story → spec-kit → one commit
/opscale-ai            # generate installer skill for consumers
```

Skills validate their prerequisites and refuse to run if missing — `opscale-iterate` requires the initial pipeline complete and zero pending tasks; `opscale-release` requires test files to exist; etc. For package projects, skip the Plan phase (`process`/`dbml`/`bpmn`) and start at `opscale-domain` with direct definitions. For library projects, skip both Plan and Generate — go straight to `opscale-test` and `opscale-release`.

## Testing

``` bash
npm run test
```

## Changelog

Please see [CHANGELOG](CHANGELOG.md) for more information on what has changed recently.

## Contributing

Please see [CONTRIBUTING](https://github.com/opscale-co/.github/blob/main/CONTRIBUTING.md) for details.

## Security

If you discover any security related issues, please email development@opscale.co instead of using the issue tracker.

## Credits

- [Opscale](https://github.com/opscale-co)

## License

The MIT License (MIT). Please see [License File](LICENSE.md) for more information.
