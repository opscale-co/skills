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

Claude Code skills and subagents for building Laravel projects. Works with new and existing projects.

The workflow stands on two ideas:

- **Spec-driven development** — every artifact (spec, data model, process map, SIPOC) is produced and validated **before** any code is generated. Code is a deterministic projection of validated artifacts, not a free-form draft. Implements [spec-driven development](https://github.com/spec-driven) on top of GitHub spec-kit.
- **Claude Code harness** — work is split into specialized skills and subagents, each with a focused scope and limited tools. The harness orchestrates small, composable units that do one thing well, instead of one monolithic prompt. This maximizes precision and reduces hallucination.

For architecture, it follows the conventions defined by [Opscale](https://github.com/opscale-co) for Laravel + Nova projects.

## Ontology

All skills share one vocabulary contract — a hierarchy that ties the business description to the technical artifacts: **Software → Domain (business line) → Subdomain (module = one business process) → Subprocess (wait-bounded segment) → Step (broad business step) → Operation (atomic: CRUD | Logic | Output)**, where each business step decomposes into 1..N operations and a Logic is a set of CRUDs grouped by a business rule. See [ONTOLOGY.md](ONTOLOGY.md) for the full definitions, the artifact each level maps to, and the traceability spine (`process step → operations.md → BPMN task → SIPOC → Action class → test`). When a skill's wording and the ontology disagree, the ontology wins.

## How It Works

The pipeline has one **setup** step (`init`), three **core harness** phases (`Plan` → `Generate` → `Review`), and a closing **Presentation** phase. Everything up to Presentation produces an **MVP**: a working, tested, releasable module that a human can sit down and demo end-to-end.

Once the MVP is done, **Iterate** is the loop you run from there on — one user story at a time — to polish the MVP into the final product.

```
init  →  Plan  →  Generate  →  Review  →  Presentation        →  Iterate
└ setup └────── core harness flow (MVP) ──────┘  └ MVP done ┘    ↺ polish

Step 1       (after init): opscale-map — domains → modules → cross-module refs (re-run before each new module)
Plan         (in order): opscale-process → opscale-dbml → opscale-bpmn → opscale-sipoc
Generate     (in order): opscale-domain → opscale-ui → opscale-logic
Review       (flexible, except test → release): opscale-debug, opscale-test, opscale-release
Presentation (in order): opscale-seed → opscale-menu → opscale-showcase
```

No phase starts until the previous one is validated. Each phase is a group of skills that orchestrate specialized subagents.

### init — setup, once per project

Skill: `opscale-init`

Setup step. Assumes you are inside an **existing PHP/Laravel project** (refuses if `composer.json` is missing). Installs spec-kit, configures MCP servers, writes the Opscale constitution, sets the **commit standard** (commitlint + Husky + semantic-release config, so every later commit is conventional), establishes the per-module `docs/` convention, and seeds the **business-types registry** (`.specify/memory/business-types.md`, language-agnostic — read by Plan) plus its Laravel/Nova binding (`.specify/memory/business-types.php` — read by Generate); both project-extensible. Every other skill checks `.specify/memory/constitution.md` exists before running.

### Plan — understand before building (strict order)

Skills: `opscale-process` → `opscale-dbml` → `opscale-bpmn` → `opscale-sipoc`

The planning phase produces validated spec artifacts — not code. Each skill takes informal input, structures it, spawns validator subagents, and only advances when the artifact passes. The four skills run **in order**; each declares its predecessor as a hard prerequisite.

Each skill writes two siblings under the spec directory — a `logs/<skill>.md` phase-by-phase Q/A record and a `final/<artifact>` canonical output. See `skills/opscale-init/references/artifact-paths.md` for the full convention.

- **Process** — captures the whole **module** as one connected macro-flow. Writes `final/process.md` with five sections — normalized entity names (*Name normalization*), the lifecycle (*Lifecycle*), the wait-bounded subprocesses with their emoji-typed steps (*Ordered flow*), the entity relations (*Relations*), and a *Narrative* — plus `final/process.mmd` (Mermaid diagram of subprocesses and steps), `final/process.txt` (plain subprocess → steps outline), and `logs/process.md`. Interactive: asks when a name is ambiguous or a step/entity is loose.
- **DBML** — DDD-aligned data model built from the spec's normalized names, business-only, with a `note` on every module/table/field, reconciled against an industry modeling standard when one applies. Columns are typed with **business types** from the central language-agnostic registry (`.specify/memory/business-types.md`) via `// type:{slug}` notes — a business type (email, money, phone, …) carries storage, validation semantics, and UI intent, so the same concept behaves identically in every module; the Laravel/Nova binding (`business-types.php`) resolves each slug to concrete fields/rules at Generate time. Writes `final/domain.dbml` (raw DBML — the ER diagram), `final/dbml.txt` (plain entity list), `final/external-refs.md` (if any cross-subdomain refs), `final/naming.md` (name lineage: business name → table → enums → model class), and `logs/dbml.md`.
- **BPMN** — process map with one `subProcess` per subprocess in *Ordered flow*. Elicits the atomic CRUD sequence first, then groups rule-driven CRUDs into Logics. Writes `final/process.bpmn` (raw BPMN 2.0 XML — the diagram), `final/operations.md` (atomic + grouped sequences and each Logic's CRUD composition), `final/bpmn.txt` (plain business step → operations outline), and `logs/bpmn.md`.
- **SIPOC** — one Suppliers/Inputs/Process/Outputs/Customers document per `businessRuleTask` in the BPMN. Writes `final/actions/{kebab-id}.sipoc.md` per Action, `final/sipoc.txt` (plain Logic → composing operations outline), and a combined `logs/sipoc.md`. The Process section is imported from `final/operations.md`, never re-elaborated. This is the contract that `opscale-logic` later materializes into PHP — `Inputs` → `parameters()`, `Process` → `handle()` body, `Outputs` → return-array keys.

Every artifact is cross-validated: the BPMN references only entities from the DBML, the DBML traces back to the spec, each SIPOC traces back to a BPMN task and the Business Rules it cites exist in the spec. Nothing is invented.

### Generate — deterministic code from validated artifacts (strict order)

Skills: `opscale-domain` → `opscale-ui` → `opscale-logic`

Each Generate skill first drives **spec-kit `/speckit.plan` + `/speckit.tasks`** to record one task per unit, then spawns parallel agents to produce the code. The generators emit the **initial scaffold** only; the LLM then customizes each class (repository methods, Resource fields, Action `handle()` bodies) — a template can't anticipate those. Generation is traceable: every generated file maps back to a tasks.md entry.

| Skill | Unit | One task per | Bundle contents |
|-------|------|--------------|-----------------|
| **Domain** | Entity bundle | DBML entity | migration + model + repository trait + owned enums + owned VOs |
| **UI** | Aggregate bundle | Aggregate root | Resource + Repeatable + shared Fields trait |
| **Logic** | Action | BPMN `businessRuleTask` | one Opscale Action class whose `handle()` materializes the SIPOC Process steps (the SIPOC itself comes from Plan #4 / `opscale-sipoc`) |

Every implementation task is preceded by a `Test {X}` task — `opscale-test` later fills the test body. There is no cap on entities/aggregates/Actions; large modules split into sequential batches of ~20 agents.

Package projects enter directly here — the user provides definitions instead of spec artifacts. The same subagents run with the same contracts.

### Review — quality gates before shipping (flexible order, except test → release)

Skills: `opscale-debug`, `opscale-test`, `opscale-release`

Review skills can be invoked at **any point after `opscale-init`** — you don't have to finish Plan or Generate first. The only ordering constraint inside Review is: `release` always runs after `test`.

- **Debug** — debug tooling by layer: Nova DevTool (UI), Telescope (domain: jobs/events), Xdebug (logic) — local/staging only, never production
- **Test** — configures the stack (Pest, Dusk, PHPStan, Duster, Rector) AND **generates the tests**: Unit (domain), Feature (Actions, real DB), Browser (**one flow test per identified process**, driving it end to end). Headless by default. `composer run build` + `composer run serve` mandatory.
- **Release** — code-quality gates for deployment: Duster (PHP + JS lint), static analysis with Opscale strict rules, Rector, SonarQube, and the GitHub Actions workflows. Refuses to run unless `tests/` is populated. (The commit standard / semantic-release config come from `opscale-init`.)

### Presentation — close the MVP (strict order)

Skills: `opscale-seed` → `opscale-menu` → `opscale-showcase`

Presentation closes the MVP. Review has already confirmed the code is correct, tested, and releasable; Presentation turns that into something a human can sit down and watch end-to-end. It answers *"does this work as a functional demo?"* — coherent data on every screen, a sidebar that reads like an operator's workflow, and a guided walkthrough that exercises the module visually. The three skills run in a deliberate sequence — data first, then navigation, then the walkthrough — each building on the previous one's effect on the workbench. **When Presentation succeeds, the MVP is done.**

- **Seed** — generates a coherent workbench `DatabaseSeeder` whose connected records let **each identified process be walked end to end**, so the demo shows the module working, not empty tables. Requires `opscale-domain`.
- **Menu** — builds a **user-friendly** sidebar organized around the module's processes / the operator's tasks (not a flat list of entities), inside `workbench/app/Providers/NovaServiceProvider.php`. Requires `opscale-ui`.
- **Showcase** — generates a **non-headless** guided Dusk test that **drives each identified process end to end** through Nova, pausing 3s before the main action on each screen, so a stakeholder watches the module actually work. Requires `opscale-seed`, `opscale-menu`, and the Dusk infrastructure from `opscale-test`.

### Iterate — polish the MVP into the final product

Skill: `opscale-iterate`

Once the MVP is closed, the work changes shape: instead of building the module from a spec, you grow it one user story at a time. `opscale-iterate` is the loop that turns each story into a focused change without rerunning the whole pipeline.

Single command that takes a **user story** (`As X / I want Y / So that Z` + Given/When/Then), drives spec-kit through specify/clarify/plan/tasks/analyze, surgically invokes only the Opscale skills the diff requires, runs the quality gates, and closes with **one Conventional Commits commit** compatible with semantic-release.

Strict gate: refuses to run unless the **MVP pipeline is complete** (Plan + Generate + Review + Presentation done) AND **zero pending tasks** in `tasks.md`. Iterate polishes a finished MVP; it does not finish a half-built one.

Every iteration is archived as `docs/iterations/YYYY-MM-DD-<slug>.md` inside the target module's spec folder — a permanent dated record alongside the `logs/` Q/A history and the `final/` canonical artifacts.

## Project Types

| Type | Description | Pipeline | Example |
|------|-------------|----------|---------|
| `app` | Complete Laravel Nova application with many modules | Full spec-driven (per module) | A multi-module SaaS platform |
| `module` | Bounded-context package within an app | Full spec-driven | `opscale-co/nova-loan-module` |
| `package` | Standalone project with specific functionality | Direct (domain/ui/logic without specs) | `nova-api`, `nova-authorization` |
| `library` | Pure utility/infrastructure code | Test + release only | `opscale-co/strict-rules` |

### Development Sequences

```
app / module    init → plan → generate → review → presentation → (iterate)*
package         init → generate → review → presentation → (iterate)*
library         init → review
```

**app/module** get the full pipeline: plan the spec artifacts, generate code from them, review with quality gates, then make the module demoable. **package** skips the planning phase — definitions are provided directly. **library** has no generation phase and no demo to present — just code, tests, and release.

`iterate` is the loop that runs after the initial pipeline closes — only valid when every prior task is complete and the tree is clean.

## New and Existing Projects

The workflow is designed for both greenfield and existing codebases.

### New Projects

Run `opscale-init`, then follow the sequence from step 1. Each step produces a validated artifact that the next step depends on.

### Existing Projects

`opscale-init` scans the existing code structure — models, migrations, Nova resources, Actions, tests — and recommends where to join the sequence:

| What already exists | Recommended entry point |
|---------------------|------------------------|
| Nothing | Step 2: `opscale-process` |
| Business docs but no code | Step 2: `opscale-process` (formalize into spec) |
| Models + migrations but no spec | Step 2: `opscale-process` (reverse-document what exists) |
| Spec + DBML + BPMN but no Actions | Step 5: `opscale-sipoc` (then `opscale-logic`) |
| Full domain + Nova but no tests | Step 10: `opscale-test` |
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
skills/        → 17 skills (orchestrators — own workflow and user dialogue)
  └─ opscale-{domain,ui,logic}/
       scripts/   → deterministic Node.js generators (.mjs)
       templates/ → mustache-lite PHP templates (.php.tmpl)
agents/        → 24 agents (execution units — own parallelizable work)
```

Skills manage the sequence, interact with the user, and spawn agents. Agents do the actual work — generating files, running validators, checking gates — in parallel where possible. Agents receive normalized input from the skill and generate code independently.

### Deterministic code generation

For the Generate phase (`domain`, `ui`, `logic`), the generators emit a deterministic **scaffold**; the LLM then customizes each class (repository methods, Resource fields, Action `handle()` bodies), since a template can't anticipate them. Each generator agent (`enum-generator`, `model-generator`, `resource-generator`, `action-generator`, etc.) is a thin wrapper that runs a Node.js script (`scripts/generate-*.mjs`) which renders a PHP template (`templates/*.php.tmpl`) from a JSON payload the skill normalized.

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

### Per-module spec layout

Every module folder under `.specify/specs/{NNN}-{slug}/` splits its artifacts into `logs/` (phase-by-phase Q/A) and `final/` (canonical, downstream-consumable). Spec-kit's own `plan.md` / `tasks.md` and `docs/iterations/` (written by `opscale-iterate`) live at the spec root.

```
.specify/specs/{NNN}-{module-name}/
├── plan.md                       ← spec-kit: tech decisions
├── tasks.md                      ← spec-kit: ordered task ledger
├── logs/                         ← phase-by-phase Q/A records (replaced each run)
│   ├── process.md
│   ├── dbml.md
│   ├── bpmn.md
│   └── sipoc.md
├── final/                        ← canonical, downstream-consumable
│   ├── process.md                ← opscale-process spec (5 sections)
│   ├── process.mmd               ← Mermaid diagram: subprocesses + steps
│   ├── process.txt                 ← plain list: subprocess → steps
│   ├── domain.dbml               ← raw DBML (the ER diagram)
│   ├── dbml.txt              ← plain list: one entity per line
│   ├── external-refs.md          ← cross-subdomain ref index (only if ≥1 ref)
│   ├── naming.md                 ← name lineage: business name → table → enums → model class
│   ├── process.bpmn              ← raw BPMN 2.0 XML (the diagram)
│   ├── operations.md             ← atomic + grouped operation sequences, Logic compositions
│   ├── bpmn.txt            ← plain list: business step → operations
│   ├── sipoc.txt          ← plain list: Logic operation → composing operations
│   └── actions/
│       └── <kebab-id>.sipoc.md   ← one per BPMN businessRuleTask
└── docs/iterations/
    └── YYYY-MM-DD-<slug>.md      ← one file per opscale-iterate run
```

App-level (shared across modules): `.specify/memory/domain-map.md` — domains → modules → cross-module reference ownership, written by `opscale-map`.

**Logs vs. final:** `final/` evolves with every re-run and iteration — it's what downstream skills and BPMN/DBML tooling consume. `logs/` captures the Q/A trail for each run, replaced each time. Canonical reference: `skills/opscale-init/references/artifact-paths.md`.

### Orchestration gates

| Skill | Required before it runs | Order |
|-------|------------------------|:-----:|
| `opscale-init` | composer.json + Laravel detected | Bootstrap |
| `opscale-map` | init | Step 1 (after init; re-run before each new module) |
| `opscale-process` | init | Plan #1 (strict) |
| `opscale-dbml` | init + process | Plan #2 (strict) |
| `opscale-bpmn` | init + process + dbml | Plan #3 (strict) |
| `opscale-sipoc` | init + process + dbml + bpmn | Plan #4 (strict, app/module only) |
| `opscale-domain` | init + process + dbml + bpmn | Generate #1 (strict) |
| `opscale-ui` | init + Plan-data + domain | Generate #2 (strict) |
| `opscale-logic` | init + Plan + sipoc + domain + ui | Generate #3 (strict) |
| `opscale-debug` | init | Review (any order) |
| `opscale-test` | init | Review (any order) |
| `opscale-release` | init + opscale-test produced test files | Review (after test) |
| `opscale-seed` | init + domain + workbench User model | Presentation #1 (strict) |
| `opscale-menu` | init + ui + workbench NovaServiceProvider | Presentation #2 (strict) |
| `opscale-showcase` | init + ui + seed + menu + test (Dusk infra) | Presentation #3 (strict) |
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
| 0 | `opscale-init` | Bootstrap scaffold, constitution, MCP servers, **commit standard** (commitlint/Husky/semantic-release), spec layout convention. Refuses if not inside a Laravel/PHP project | Yes | Yes | Yes | Yes |
| 1 | `opscale-map` | App-level domain map: business lines (domains) → modules (subdomains) → cross-module ref ownership. Writes `.specify/memory/domain-map.md`. First step after init; re-run before each new module so its DBML can target existing modules as external refs | Yes | Yes | -- | -- |
| 2 | `opscale-process` | Module macro-flow: normalized names + lifecycle + wait-bounded subprocesses with typed steps + relations + narrative. Writes `final/process.md` + `logs/process.md` | Per module | Yes | -- | -- |
| 3 | `opscale-dbml` | DDD-aligned DBML from the normalized names (business-only, `note` on module/table/field). Writes raw `final/domain.dbml` (+ `final/external-refs.md` if any cross-subdomain refs) + `final/naming.md` + `logs/dbml.md` | Per module | Yes | -- | -- |
| 4 | `opscale-bpmn` | BPMN 2.0 map (one subProcess per subprocess in *Ordered flow*; atomic CRUD sequence → Logic grouping). Writes raw `final/process.bpmn` + `final/operations.md` + `logs/bpmn.md` | Per module | Yes | -- | -- |
| 5 | `opscale-sipoc` | One SIPOC per `businessRuleTask` under `final/actions/{kebab-id}.sipoc.md` — Suppliers/Inputs/Process/Outputs/Customers per Action. Combined Q/A in `logs/sipoc.md`. Consumed by `opscale-logic` | Per module | Yes | -- | -- |
| 6 | `opscale-domain` | Spec-kit plan + tasks (one per entity bundle), then models/migrations/enums/VOs/repos. No entity cap | Per module | Yes | Yes | -- |
| 7 | `opscale-ui` | Spec-kit plan + tasks (one per aggregate bundle), then Resources + Repeatables + Field traits | Per module | Yes | Yes | -- |
| 8 | `opscale-logic` | Spec-kit plan + tasks (one per Action), then Opscale Actions. Reads `final/actions/*.sipoc.md` (produced by `opscale-sipoc`) to derive `parameters()` and `handle()` body | Per module | Yes | Yes | -- |
| 9 | `opscale-debug` | Nova DevTool (UI) + Telescope (domain) + Xdebug (logic), local/staging only | Yes | Yes | Yes | Optional |
| 10 | `opscale-test` | Stack config (Pest, Dusk, PHPStan, Duster, Rector) + **generates Unit (domain) / Feature (Actions) / Browser (one per identified process) tests**. Headless by default. `composer build`/`serve` | Yes | Yes | Yes | Yes |
| 11 | `opscale-release` | Code quality for deployment: Duster (PHP+JS), static analysis (strict rules), Rector, SonarQube, GitHub Actions. Refuses without test files | deploy-app | publish-package | publish-package | publish-package |

#### Presentation

Strict order: seed → menu → showcase. Runs after Review has signed off on quality (see the lifecycle diagram above) and turns the verified module into a functional demo a human can sit down and watch end to end.

| Skill | Purpose | app | module | package | library |
|-------|---------|:---:|:------:|:-------:|:-------:|
| `opscale-seed` | Coherent `DatabaseSeeder` that lets each identified process be walked end to end; gives every Nova page data and unblocks Browser tests | Per module | Yes | Yes | -- |
| `opscale-menu` | User-friendly sidebar organized around the module's processes / operator tasks (not a flat entity list) | Per module | Yes | Yes | -- |
| `opscale-showcase` | Non-headless guided Dusk test that drives each identified process end to end with a 3s pause before each main action — the stakeholder-ready functional demo | Per module | Yes | Yes | -- |

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

Require spec documentation artifacts (`final/process.md`, `final/domain.dbml`, `final/process.bpmn`).

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
| `release-config-generator` | opscale-release | Quality + CI configs (duster, rector, sonar, GitHub workflows). Commit configs (.releaserc, commitlint, husky) come from opscale-init |

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

## Validation Pipeline

Reproducible creation/validation flow for every skill in `skills/` (discovered automatically — any directory with a `SKILL.md`). Generic by design: nothing in `tools/` knows a language or framework; all stack coupling lives in `skills.config.yml` (compilers map, per-skill fixture + `verify` commands), in each skill's `evals/`, and in pluggable `tools/graders/`. The trigger-eval engine, benchmark aggregation and packaging are reused verbatim from Anthropic's skill-creator (vendored in `tools/vendor/skill-creator/`).

| Layer | Tool | Cost | What it checks |
|---|---|---|---|
| 1 Lint | `python3 tools/lint_skills.py [--json]` | free, seconds | frontmatter, kebab-case name, description 50-500, referenced paths exist in the bundle, scripts compile (via config `compilers`), no secrets; warnings: >500-line SKILL.md, imperative walls, reference TOCs, eval overfitting, cross-bundle paths |
| 2 Trigger | `python3 tools/run_trigger_evals.py skills/<name>` | headless API | `evals/trigger.json` — 10 positive phrasings + 10 near-miss negatives per skill, `runs` times each, pass-rate vs config `threshold` |
| 3 Functional | `python3 tools/run_functional_evals.py skills/<name>` | headless API | `evals/functional.json` against a tmpdir copy of the fixture; assertions in priority order `verify` (config toolchain) > `script` (graders, fed the manifest of files the agent actually generated) > `llm` (last resort); always runs a no-skill baseline and reports the delta in `benchmark.json` |
| 4 Improve | `python3 tools/improve_loop.py skills/<name>` | headless API | 60/40 train/test split (reviser never sees test), revise-and-re-eval until convergence, 2-strike test-score stagnation triggers rollback, `token_budget` aborts; winner chosen by test score; snapshots per iteration in `<skill>-workspace/` |

Grader contract (`tools/graders/README.md`): a grader receives the output dir, exits 0/1, prints one message — that is all the runner knows. Budgets in `skills.config.yml` are aligned to the Claude Max 20x plan: layers 2-4 run via `claude -p`, which bills the separate headless monthly credit (~200 USD), not the interactive 5-hour window; `token_budget` caps one improve-loop run at about half a window (220k tokens) and `headless_daily_usd` keeps a month of nightly CI inside the credit.

CI (`.github/workflows/skills.yml`): `lint` on every push; `eval` only for skills touched by the push (matrix per skill — layers 2-3 spend credit, so they never run unfiltered); `package` on main only after `eval`, publishing `.skill` bundles (evals/fixtures excluded) as artifacts.

Linter tests: `python3 -m unittest discover tools/tests`.

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
/opscale-init          # bootstrap project + commit standard (commitlint/husky/semantic-release)
/opscale-map           # app-level domain map: business lines → modules → cross-module refs
/opscale-process       # capture the module macro-flow: names + lifecycle + subprocesses + relations
/opscale-dbml          # generate raw final/domain.dbml + external-refs.md + naming.md + logs/dbml.md
/opscale-bpmn          # generate raw final/process.bpmn + final/operations.md + logs/bpmn.md
/opscale-sipoc         # one SIPOC per Action under final/actions/ + combined logs/sipoc.md (input for opscale-logic)
/opscale-domain        # plan + tasks per entity, then generate domain layer
/opscale-ui            # plan + tasks per aggregate, then generate Nova layer
/opscale-logic         # plan + tasks per Action, consumes SIPOCs to generate Opscale Actions
/opscale-debug         # Nova DevTool (UI) + Telescope (domain) + Xdebug (logic)
/opscale-test          # configure stack AND generate Unit/Feature/Browser tests
/opscale-release       # code quality (Duster/Rector/SonarQube) + CI/CD
/opscale-seed          # workbench DatabaseSeeder that walks each process end to end
/opscale-menu          # user-friendly sidebar organized around the module's processes
/opscale-showcase      # non-headless Dusk demo driving each process (3s pauses)
/opscale-iterate       # add the next feature via user story → spec-kit → one commit
/opscale-ai            # generate installer skill for consumers
```

Skills validate their prerequisites and refuse to run if missing — `opscale-iterate` requires the initial pipeline complete and zero pending tasks; `opscale-release` requires test files to exist; etc. For package projects, skip the Plan phase (`process`/`dbml`/`bpmn`) and start at `opscale-domain` with direct definitions. For library projects, skip both Plan and Generate — go straight to `opscale-test` and `opscale-release`.

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
