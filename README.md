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

All skills share one vocabulary contract — a hierarchy that ties the business description to the technical artifacts: **Software → Domain (business line) → Subdomain (module = one business process) → Subprocess (wait-bounded segment) → Step (broad business step) → Operation (atomic: CRUD | Logic | Output)**, where each business step decomposes into 1..N operations and a Logic is a set of CRUDs grouped by a business rule. See [ONTOLOGY.md](ONTOLOGY.md) for the full definitions, the artifact each level maps to, and the traceability spine (`process step → bpmn.json operation / BPMN task metadata → SIPOC → Action class → test`). When a skill's wording and the ontology disagree, the ontology wins.

## How It Works

The pipeline has one **setup** step (`init`), three **core harness** phases (`Plan` → `Generate` → `Review`), and a closing **Presentation** phase. Everything up to Presentation produces an **MVP**: a working, tested, releasable module that a human can sit down and demo end-to-end.

Once the MVP is done, **Iterate** is the loop you run from there on — one user story at a time — to polish the MVP into the final product.

```
Plan  →  Generate  →  Review  →  Presentation  →  Iterate
└──── first MVP of the subdomain ────┘  └ demo ┘   ↺ polish

Step 1       (before Plan): opscale-map — domains → modules → cross-module refs (re-run before each new module)
Plan         (in order): opscale-process → opscale-dbml → opscale-bpmn → opscale-sipoc → opscale-graph
Generate     (in order): opscale-init → opscale-domain → opscale-logic → opscale-ui
Review:      opscale-release
Presentation: opscale-showcase
```

The **graph** artifact (`docs/plan/graph.json` + rendered `graph.html`) is the **single source of truth for generation**: the Generate skills read it as the build manifest (the hierarchy of what to build — Actions from its logic operations; entities/enums from `dbml.json`) and consult `dbml.dbml` / `bpmn.bpmn` / `sipoc/` for detail. The first Generate run produces the **MVP** — the first version of the subdomain, opened by `opscale-init` as the spec-kit feature `.specify/specs/001-mvp/`; later changes go through `opscale-iterate` (features `002-…`, `003-…`). Each Generate skill also produces its own tests (Unit in domain, Feature in logic, Browser in ui) and runs the linters — there is no separate test or debug step (their configuration is set up once by `opscale-init`).

No phase starts until the previous one is validated. Each phase is a group of skills that orchestrate specialized subagents.

### init — setup, once per project

Skill: `opscale-init`

Setup step. Assumes you are inside an **existing PHP/Laravel project** (refuses if `composer.json` is missing). Installs spec-kit, configures MCP servers, writes the Opscale constitution, sets the **commit standard** (commitlint + Husky + semantic-release config, so every later commit is conventional), creates the **`docs/plan/` intake folder** with its manifest (the landing zone every Plan skill writes to — including artifacts brought over from a Claude Desktop planning session), and seeds the **business-types registry** (`docs/plan/context/business-types.md`, language-agnostic — read by Plan) plus its Laravel/Nova binding (`.specify/memory/business-types.php` — read by Generate); both project-extensible. Generate/Review/Presentation skills check `.specify/memory/constitution.md` exists before running; the Plan skills only need `docs/plan/` and never require init — they run before it, or with no repo at all. Init is decoupled from the Plan flow: when it runs on a project whose `docs/plan/` already holds Plan artifacts, it adopts them as-is (Phase 6b).

### Plan — understand before building (strict order)

Skills: `opscale-process` → `opscale-dbml` → `opscale-bpmn` → `opscale-sipoc` → `opscale-graph`

The planning phase produces validated spec artifacts — not code. Each skill takes informal input, structures it, and only advances when the artifact passes its gate. The five skills run **in order**; each declares its predecessor's artifacts as a hard prerequisite.

The Plan phase is **stack-agnostic and exportable**: every artifact is a plain document in the repo's flat `docs/plan/` folder, and `opscale-init` is not a prerequisite. With a writable project folder (Claude Code, or Claude Desktop opened on a repo/folder) the skills write there directly; with no folder access they produce the same files as downloadable outputs the user drops into `docs/plan/`. Each Plan artifact is a **schema-validated JSON source of truth plus a deterministic diagram projection** (`process.json`→`process.mmd`, `dbml.json`→`dbml.dbml`, `bpmn.json`→`bpmn.bpmn`, `sipoc.json`→`sipoc/<id>.md`, `graph.json`→`graph.html`), validated and rendered by the shared contract under `shared/plan-contract/`. See `shared/plan-contract/artifact-paths.md` for the full convention.

- **Process** — captures the whole **module** as one connected macro-flow: identifies the central entity and its life stages (only to derive the subprocesses — enum values are dbml's job), the wait-bounded subprocesses with their steps, and the events that separate them. Writes `docs/plan/context/names.md` (name normalization: canonical ← aliases) and the schema-validated `docs/plan/process.json` (the `module` block — software/domain/subdomain — is the SINGLE source for the whole plan; dbml/bpmn/sipoc/graph derive it and carry none; then one block per subprocess: name, `Trigger:`, `Ends with:`, and steps with ≤25-char titles + descriptions — ≤5 subprocesses, each with 2–5 steps), rendered to `docs/plan/process.mmd`. Interactive: asks when a name is ambiguous or a step/entity is loose.
- **DBML** — DDD-aligned data model built from the spec's normalized names, business-only, with a `note` on every module/table/field, reconciled against an industry modeling standard when one applies. Columns are typed with **business types** from the central language-agnostic registry (`docs/plan/context/business-types.md`) — the slug IS the DBML column type (`contact_email email`, `total money`; never `varchar`/`decimal`): a business type carries storage, validation semantics, and UI intent, so the same concept behaves identically in every module; the stack-specific binding (`business-types.php`) resolves each slug to concrete storage/fields/rules at Generate time. Writes the schema-validated `docs/plan/dbml.json` (the source of truth — module `prefix`/`MODULE_PREFIX`, a `standards` block, per-entity `permissions` predicates, mandatory `relationships`, a `calculated` flag on derived fields, and no audit fields; every entity carries its kebab id, assigned here on the final entities), rendered to `docs/plan/dbml.dbml` (the ER diagram), and `context/external-refs.md` (if any cross-subdomain refs).
- **BPMN** — BPMN 2.0 process map where each subprocess is modeled as its own expandable `<bpmn:subProcess>` container (collapsible in bpmn.io), bounded by its closing wait event (the spec's *Ends with:* line). Elicits the atomic CRUD sequence first, then groups rule-driven CRUDs into Logics; a Logic never contains a `create` (creation is always a standalone CRUD). Writes the schema-validated `docs/plan/bpmn.json` (the source of truth — `operations` is a nested map keyed by subprocess code → step code, both references to `process.json`; each operation carries its `code`, its per-step `position`, and, for Logics, the rules and composed read/update/delete CRUDs + Outputs; every Output is composed inside a Logic, never standalone) rendered to `docs/plan/bpmn.bpmn` (self-contained BPMN 2.0 XML, embedded `<documentation>` JSON).
- **SIPOC** — one Suppliers/Inputs/Process/Outputs/Customers document per first-level logic operation in the BPMN. Writes the schema-validated `docs/plan/sipoc.json` (the source of truth) rendered to `docs/plan/sipoc/{kebab-id}.md` per Action. Each SIPOC links to its BPMN logic op **purely by `id`** (operation/subprocess/step are derived, not stored); its Process **references the Logic's composed operation `code`s** (`process[].operation`), never re-elaborated. This is the contract that `opscale-logic` later materializes into code — `Inputs` → parameters, `Process` → the Action's executable body, `Outputs` → its returned keys.
- **Graph** — the non-interactive Plan closer (`opscale-graph`). Reads only the four canonical Plan JSONs and builds the whole hierarchy — Software → Domain → Module → Subprocess → Business Step → Operation, each Logic expanded into its composed CRUDs/logic-refs/Outputs — as the schema-validated `docs/plan/graph.json` (a nested `{id, ref}` hierarchy, every element ref-ing the phase that owns it; island-free in the sense that *every `ref` resolves*), rendered to `docs/plan/graph.html`, an interactive, self-contained card tree that opens in any browser offline. It asks nothing and invents nothing — but it is **not** a dead-end view: it is the **build manifest** the Generate phase reads (`opscale-init`/`domain`/`logic`/`ui` enumerate what to build from it — Actions from its logic operations, entities/enums from `dbml.json` — then consult dbml/bpmn/sipoc for detail). Never hand-edited; regenerated whenever a Plan artifact changes. No Plan skill reads it.

Every artifact is cross-validated: the BPMN references only entities from the DBML, the DBML traces back to the spec, each SIPOC traces back to a BPMN task and the Business Rules it cites exist in the spec, and the graph is count-checked against all of them. Nothing is invented.

### Generate — deterministic code from validated artifacts (strict order)

Skills: `opscale-init` → `opscale-domain` → `opscale-logic` → `opscale-ui`

Generate reads the **ontology manifest** to know what to build and consults `dbml.dbml` / `bpmn.bpmn` / `sipoc/` for the detail. `opscale-init` runs first — it opens the MVP feature (`.specify/specs/001-mvp/`) and stands up the dev/test/debug harness once. Each code skill then drives **spec-kit `/speckit.plan` + `/speckit.tasks`** to record one task per unit, spawns parallel agents to produce the code, **authors that layer's tests**, and runs the linters before its gate. The generators emit the **initial scaffold** only; the LLM then customizes each class (repository methods, Resource fields, Action `handle()` bodies) — a template can't anticipate those. Generation is traceable: every generated file maps back to a tasks.md entry.

| Skill | Unit | One task per | Bundle contents | Tests produced |
|-------|------|--------------|-----------------|----------------|
| **Init** | — | — | dev/test/debug harness + `001-mvp` feature | — (configures the harness) |
| **Domain** | Entity bundle | DBML entity | migration + model + repository trait + owned enums + owned VOs + factory | **Unit** (per component) |
| **Logic** | Action | BPMN `businessRuleTask` | one Opscale Action class whose `handle()` materializes the SIPOC Process steps (the SIPOC itself comes from Plan #4 / `opscale-sipoc`) | **Feature** (positive / negative / false-positive / false-negative) |
| **UI** | Entity Resource | **DBML entity** (one Resource each) | Resource (relations as tabs) + Repeatable + shared Fields trait + registers each Action with `canSee` | **Browser** (one flow per subprocess) |

There is no cap on entities/aggregates/Actions; large modules split into sequential batches of ~20 agents. There is no separate test or debug step — each code skill owns its own tests, and `opscale-init` configured the harness once.

Package projects enter directly at `opscale-domain` (after a lean `opscale-init`) — the user provides definitions instead of spec artifacts. The same subagents run with the same contracts.

### Review — quality gates before shipping

Skill: `opscale-release`

Review can be invoked at **any point after Generate has produced the code and its tests** — `opscale-release` refuses to run unless `tests/Unit`, `tests/Feature`, and `tests/Browser` are populated (by domain/logic/ui respectively).

- **Release** — code-quality gates for deployment: Duster (PHP + JS lint), static analysis with Opscale strict rules, Rector, SonarQube, and the GitHub Actions workflows. (The commit standard / semantic-release config, and the linter/test/debug harness, all come from `opscale-init`.)

### Presentation — close the MVP

Skill: `opscale-showcase`

Presentation closes the MVP. Review has already confirmed the code is correct, tested, and releasable; Presentation turns that into something a human can sit down and watch end-to-end. It answers *"does this work as a functional demo?"* — coherent data on every screen, a sidebar that reads like an operator's workflow, and a guided walkthrough that exercises the module visually. `opscale-showcase` runs its three phases in a deliberate sequence — data first, then navigation, then the walkthrough — each building on the previous one's effect on the workbench. **When Presentation succeeds, the MVP is done.**

- **Showcase** (Phase A — Seed) — generates a coherent workbench `DatabaseSeeder` whose connected records let **each identified process be walked end to end**, so the demo shows the module working, not empty tables.
- **Showcase** (Phase B — Menu) — builds a **user-friendly** sidebar organized around the module's processes / the operator's tasks (not a flat list of entities), inside `workbench/app/Providers/NovaServiceProvider.php`.
- **Showcase** (Phase C — Walkthrough) — generates a **non-headless** guided Dusk test that **drives each identified process end to end** through Nova, pausing 3s before the main action on each screen, so a stakeholder watches the module actually work. Uses the Dusk infrastructure from `opscale-init`.

### Iterate — polish the MVP into the final product

Skill: `opscale-iterate`

Once the MVP is closed, the work changes shape: instead of building the module from a spec, you grow it one user story at a time. `opscale-iterate` is the loop that turns each story into a focused change without rerunning the whole pipeline.

Single command that takes a **user story** (`As X / I want Y / So that Z` + Given/When/Then), drives spec-kit through specify/clarify/plan/tasks/analyze, surgically invokes only the Opscale skills the diff requires, runs the quality gates, and closes with **one Conventional Commits commit** compatible with semantic-release.

Strict gate: refuses to run unless the **MVP pipeline is complete** (Plan + Generate + Review + Presentation done) AND **zero pending tasks** in `tasks.md`. Iterate polishes a finished MVP; it does not finish a half-built one.

Every iteration is archived as `docs/iterations/YYYY-MM-DD-<slug>.md` inside the target module's spec folder — a permanent dated record alongside the canonical Plan artifacts in `docs/plan/`.

## Project Types

| Type | Description | Pipeline | Example |
|------|-------------|----------|---------|
| `app` | Complete Laravel Nova application with many modules | Full spec-driven (per module) | A multi-module SaaS platform |
| `module` | Bounded-context package within an app | Full spec-driven | `opscale-co/nova-loan-module` |
| `package` | Standalone project with specific functionality | Direct (domain/ui/logic without specs) | `nova-api`, `nova-authorization` |
| `library` | Pure utility/infrastructure code | init (harness) + release only | `opscale-co/strict-rules` |

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

Start the Plan phase directly from step 1 (`opscale-map` → `opscale-process` → …) — in Claude Code or Claude Desktop, `opscale-init` is not required for Plan. Run `opscale-init` before entering the Generate phase; it adopts any Plan artifacts already present in `docs/plan/`. Each step produces a validated artifact that the next step depends on.

### Existing Projects

`opscale-init` scans the existing code structure — models, migrations, Nova resources, Actions, tests — and recommends where to join the sequence:

| What already exists | Recommended entry point |
|---------------------|------------------------|
| Nothing | Step 2: `opscale-process` |
| Business docs but no code | Step 2: `opscale-process` (formalize into spec) |
| Models + migrations but no spec | Step 2: `opscale-process` (reverse-document what exists) |
| Spec + DBML + BPMN but no Actions | Step 5: `opscale-sipoc` (then `opscale-logic`) |
| Full domain but no tests | `opscale-domain` (Unit) → `opscale-logic` (Feature) → `opscale-ui` (Browser) |
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
skills/        → 14 skills (orchestrators — own workflow and user dialogue)
  └─ opscale-{domain,ui,logic}/
       scripts/   → deterministic Node.js generators (.mjs)
       templates/ → mustache-lite PHP templates (.php.tmpl)
agents/        → 23 agents (execution units — own parallelizable work)
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

### Plan artifact layout

Plan artifacts live in the flat, exportable `docs/plan/` folder — one module per folder (multi-module apps keep one `docs/plan/` per module repo). Spec-kit keeps its own files under `.specify/`.

```
docs/plan/
├── README.md              ← manifest (opscale-init): which skill produces which file, in order
├── context/               ← shared context: app-level views + module-wide registries
│   ├── system.map.md      ← ALL domains → ALL modules → cross-module refs (opscale-map);
│   │                        header carries the software name + purpose
│   ├── names.md           ← name normalization: canonical ← aliases (no ids; opscale-process)
│   ├── business-types.md  ← language-agnostic business-type registry
│   └── external-refs.md   ← cross-subdomain ref index (opscale-dbml; only if ≥1 ref)
├── process.json           ← SoT: one block per subprocess (Trigger/Ends with + steps)
├── process.mmd            ← rendered Mermaid flowchart of the macro-flow
├── dbml.json              ← SoT: data model (prefix, standards, permissions, relationships, calculated flag)
├── dbml.dbml              ← rendered DBML (the ER diagram)
├── bpmn.json              ← SoT: operations per subprocess (composed CRUDs/Outputs nested under their Logic)
├── bpmn.bpmn              ← rendered BPMN 2.0 XML (the diagram; one expandable subProcess per subprocess)
├── sipoc.json             ← SoT: one SIPOC per first-level logic operation
├── graph.json             ← SoT: traceability graph (nested {id, ref} hierarchy; Plan closer)
├── graph.html             ← interactive, self-contained HTML card tree of the whole hierarchy
└── sipoc/
    └── <kebab-id>.md      ← rendered SIPOC per first-level logic operation
```

Spec-kit side (repo projects, written by `opscale-init` and the `/speckit.*` commands): `.specify/memory/constitution.md`, `.specify/memory/business-types.php` (stack binding, read by Generate), `.specify/specs/{NNN}-{slug}/plan.md` + `tasks.md`, and `docs/iterations/` (written by `opscale-iterate`).

There are no phase logs: every `docs/plan/` file is canonical and evolves with every re-run and iteration — it's what downstream skills and BPMN/DBML tooling consume. Canonical reference: `shared/plan-contract/artifact-paths.md`.

### Orchestration gates

| Skill | Required before it runs | Order |
|-------|------------------------|:-----:|
| `opscale-map` | — (docs/plan/ created if missing) | Step 1 (before each module's Plan; re-run before each new module) |
| `opscale-process` | — (docs/plan/ created if missing) | Plan #1 (strict) |
| `opscale-dbml` | process | Plan #2 (strict) |
| `opscale-bpmn` | process + dbml | Plan #3 (strict) |
| `opscale-sipoc` | process + dbml + bpmn | Plan #4 (strict, app/module only) |
| `opscale-graph` | map + process + dbml + bpmn + sipoc | Plan #5 (strict, app/module only, non-interactive Plan closer) |
| `opscale-init` | composer.json + Laravel detected | Generate #1 (strict, first) |
| `opscale-domain` | init + process + dbml + bpmn + graph | Generate #2 (strict) — also authors Unit tests |
| `opscale-logic` | init + Plan + sipoc + domain | Generate #3 (strict) — also authors Feature tests |
| `opscale-ui` | init + Plan-data + domain + logic | Generate #4 (strict, last) — registers Actions, authors Browser tests |
| `opscale-release` | init + Generate produced tests/Unit + tests/Feature + tests/Browser | Review (after Generate) |
| `opscale-showcase` | init + domain + logic + ui (+ Dusk infra from init) | Presentation (strict, after Review) |
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

| Step | Phase | Skill | Purpose | app | module | package | library |
|------|-------|-------|---------|:---:|:------:|:-------:|:-------:|
| 1 | — | `opscale-map` | App-level domain map: business lines (domains) → modules (subdomains) → cross-module ref ownership. Writes `docs/plan/context/system.map.md` (header carries the software name + purpose). Runs before each module's Plan; re-run before each new module so its DBML can target existing modules as external refs | Yes | Yes | -- | -- |
| 2 | Plan | `opscale-process` | Module macro-flow: normalized names + wait-bounded subprocesses with their steps and separating events. Writes `docs/plan/context/names.md` + schema-validated `docs/plan/process.json` (→ rendered `process.mmd`) | Per module | Yes | -- | -- |
| 3 | Plan | `opscale-dbml` | DDD-aligned data model from the normalized names (business-only; prefix, standards, per-entity permissions, relationships, calculated-field flag, no audit fields). Writes schema-validated `docs/plan/dbml.json` (→ rendered `dbml.dbml`, kebab-id-stamped; + `external-refs.md` if any cross-subdomain refs) | Per module | Yes | -- | -- |
| 4 | Plan | `opscale-bpmn` | BPMN 2.0 map (one expandable subProcess per subprocess; atomic CRUD sequence → Logic grouping, no `create` inside a Logic). Writes schema-validated `docs/plan/bpmn.json` (→ rendered self-contained `bpmn.bpmn`) | Per module | Yes | -- | -- |
| 5 | Plan | `opscale-sipoc` | One SIPOC per first-level logic operation. Writes schema-validated `docs/plan/sipoc.json` (→ rendered `docs/plan/sipoc/{kebab-id}.md`) — Suppliers/Inputs/Process/Outputs/Customers per Action. Consumed by `opscale-logic` | Per module | Yes | -- | -- |
| 6 | Plan | `opscale-graph` | Non-interactive Plan closer: builds Software → Domain → Module → Subprocess → Step → Operation (each Logic with its composed CRUDs/logic-refs/Outputs) as schema-validated `docs/plan/graph.json` (nested `{id, ref}` hierarchy → rendered interactive, self-contained `graph.html` card tree). **This is the build manifest the Generate phase reads** | Per module | Yes | -- | -- |
| 7 | Generate | `opscale-init` | **First step of Generate.** Bootstrap scaffold, constitution, MCP servers, **commit standard** (commitlint/Husky/semantic-release), and the full dev/test/debug harness (Xdebug/Telescope/Debugbar, Pest/Dusk/Testbench/PHPStan/Duster/Rector). Opens the MVP feature `.specify/specs/001-mvp/`. Refuses if not inside a Laravel/PHP project | Yes | Yes | Yes | Yes |
| 8 | Generate | `opscale-domain` | Spec-kit plan + tasks (one per entity bundle), then models/migrations/enums/VOs/repos + factories, **plus their Unit tests**, then runs linters. No entity cap | Per module | Yes | Yes | -- |
| 9 | Generate | `opscale-logic` | Spec-kit plan + tasks (one per Action), then Opscale Actions (reads `docs/plan/sipoc/*.md` for `parameters()`/`handle()`), **plus their Feature tests** (positive/negative/false-positive/false-negative), then runs linters | Per module | Yes | Yes | -- |
| 10 | Generate | `opscale-ui` | Spec-kit plan + tasks (**one Resource per DBML entity**, relations as tabs), registers each Action with `canSee`, **plus the Browser/flow tests** (one per subprocess), then runs linters | Per module | Yes | Yes | -- |
| 11 | Review | `opscale-release` | Code quality for deployment: Duster (PHP+JS), static analysis (strict rules), Rector, SonarQube, GitHub Actions. Refuses without `tests/Unit` + `tests/Feature` + `tests/Browser` | deploy-app | publish-package | publish-package | publish-package |

#### Presentation

Runs after Review has signed off on quality (see the lifecycle diagram above) and turns the verified module into a functional demo a human can sit down and watch end to end.

| Skill | Purpose | app | module | package | library |
|-------|---------|:---:|:------:|:-------:|:-------:|
| `opscale-showcase` | Presentation phase in three ordered internal phases — **Seed** (coherent `DatabaseSeeder` that lets each process be walked end to end), **Menu** (user-friendly sidebar organized around the module's processes, not a flat entity list), **Walkthrough** (non-headless guided Dusk test driving each process end to end with a 3s pause before each main action) — the stakeholder-ready functional demo | Per module | Yes | Yes | -- |

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

Require spec documentation artifacts (`docs/plan/process.json`, `docs/plan/dbml.json`, `docs/plan/bpmn.json`).

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
| `resource-generator` | opscale-ui | `generate-resource.mjs` | One per DBML entity |
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
  │     (e.g. dbml + domain + ui — each re-runs its own tests; never the full pipeline)
  ├─ Runs composer run check (+ test:browser if Nova changed)
  └─ Creates one Conventional Commits commit on iter/<slug> branch
```

#### library — `opscale-domain` with 6 classes

```
opscale-domain (skill — orchestrates)
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

When a new skill lands in `skills/`, it is NOT picked up until its symlink exists — create it with the same `ln -s` line (or re-run the loop, which skips existing links). To check what is installed versus what the repo has:

```bash
ls -la ~/.claude/skills
```

## Usage

Each skill is invoked as a Claude Code slash command inside the target project directory:

```
/opscale-map           # app-level domain map: business lines → modules → cross-module refs
/opscale-process       # capture the module macro-flow: names + lifecycle + subprocesses + relations
/opscale-dbml          # generate docs/plan/dbml.json → rendered dbml.dbml (+ external-refs.md)
/opscale-bpmn          # generate docs/plan/bpmn.json → rendered self-contained bpmn.bpmn
/opscale-sipoc         # generate docs/plan/sipoc.json → rendered sipoc/<id>.md (input for opscale-logic)
/opscale-graph         # close Plan: docs/plan/graph.json → rendered graph.html card tree
/opscale-init          # first Generate step: bootstrap + commit standard + dev/test/debug harness + open 001-mvp
/opscale-domain        # plan + tasks per entity, generate domain layer + Unit tests + factories
/opscale-logic         # plan + tasks per Action, consumes SIPOCs to generate Opscale Actions + Feature tests
/opscale-ui            # plan + tasks per entity (one Resource each), register Actions + Browser tests
/opscale-release       # code quality (Duster/Rector/SonarQube) + CI/CD
/opscale-showcase      # Presentation: seed + process-driven menu + non-headless Dusk demo (3s pauses)
/opscale-iterate       # add the next feature via user story → spec-kit → one commit
/opscale-ai            # generate installer skill for consumers
```

Skills validate their prerequisites and refuse to run if missing — `opscale-iterate` requires the initial pipeline complete and zero pending tasks; `opscale-release` requires the per-layer test files (Unit/Feature/Browser) to exist; etc. For package projects, skip the Plan phase (`process`/`dbml`/`bpmn`) and start at `opscale-init` then `opscale-domain` with direct definitions. For library projects, skip both Plan and the code layers — run `opscale-init` (harness only) then `opscale-release`.

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
