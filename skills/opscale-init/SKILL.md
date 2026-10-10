---
name: opscale-init
description: >
  First step of Generate — bootstraps an Opscale/Laravel Nova module and stands
  up its full dev/test/debug environment (spec-kit, MCP, constitution, linters,
  Xdebug/Telescope/Debugbar, phpunit/dusk/testbench/Pest/phpstan), then opens the
  MVP feature. Runs before opscale-domain; the Plan phase still runs without it.
  Trigger: "start a new module", "initialize the project", "configure tests and
  debug". Not for iterating an already-initialized project — that's opscale-iterate.
---

# opscale-init

## Context

### Purpose

`opscale-init` is the **first step of the Generate phase** (init → domain → logic → ui). It does two jobs at once: it bootstraps a new Opscale module or project with GitHub spec-kit's Spec-Driven Development scaffold and Opscale-specific `constitution.md`, and it **stands up the entire dev / test / debug environment** so that from this point on every later skill can lint, debug, and run unit / feature / browser tests without any further setup. It closes by **opening the MVP feature** (`.specify/specs/001-mvp/`) — the first version of the subdomain — that the rest of Generate fills in.

The constitution is the single most important file in the project. Every subsequent skill (`opscale-process`, `opscale-dbml`, `opscale-bpmn`, etc.) produces artifacts that Claude Code validates against it. Getting it right once here prevents drift across the entire development lifecycle.

**Init owns environment configuration, not test generation.** It configures the debug stack (Phase 4e) and the test harness (Phase 4f) so the tooling is ready on day 1; the actual test files are authored later by the Generate skills that own each layer (`opscale-domain`, `opscale-logic`, `opscale-ui`) — init only lays the tracks.

Init also creates the **Plan intake folder** `docs/plan/` (with its manifest `README.md` and `context/`): the flat, exportable home of every Plan-phase artifact — written directly by the Plan skills in Claude Code, or dropped in from a Claude Desktop planning session. Layout: `references/artifact-paths.md`.

**Init is NOT a prerequisite of the Plan phase.** The Plan skills (`opscale-map`, `opscale-process`, `opscale-dbml`, `opscale-bpmn`, `opscale-sipoc`, `opscale-ontology`) create and populate `docs/plan/` on their own, in Claude Code or Claude Desktop, with or without a repo — a Desktop session may well be running on a repo folder and write there directly. Init IS the mandatory first step of **Generate** and everything after it (Review / Presentation) — the whole Laravel side. When init runs on a project whose `docs/plan/` already has Plan artifacts, that is the normal flow, not an anomaly — Phase 6b below adopts them as-is.

### Prerequisites — project context (MUST be a Laravel/PHP project)

`opscale-init` **assumes the current working directory is already an existing PHP/Laravel project**. It does not bootstrap a Laravel app from scratch. Before doing anything else, verify:

```bash
# Required: composer.json must exist
test -f composer.json || echo "MISSING — not a PHP project"

# Strongly preferred: the project should be Laravel-based
# (laravel/framework for apps, or laravel/nova/orchestra/testbench for packages)
grep -qE '"laravel/(framework|nova)"|"orchestra/testbench"' composer.json \
  || echo "WARNING — Laravel/Nova not detected in composer.json"

# Required: PHP available
php --version
```

If `composer.json` is missing, **stop and refuse to proceed** — instruct the user to first create the Laravel project (`composer create-project laravel/laravel .` or `composer init` for a package) and then re-run `/opscale-init`.

If Laravel is not detected but `composer.json` exists, ask the user to confirm the project type (`app` / `module` / `package` / `library`) and proceed only if they explicitly confirm — `opscale-*` skills only produce useful output in Laravel contexts.

### Prerequisites — tooling

Before running, verify the following are installed in the environment:

```bash
# Python package manager (required by spec-kit)
uv --version

# Git (required by spec-kit)
git --version

# Node.js / npx (required for MCP servers)
npx --version

# Claude Code CLI (required for /speckit.* commands)
claude --version
```

If any are missing, guide the user to install them before proceeding.

### Project type matrix

| Type | Use for | Example |
|------|---------|---------|
| `app` | Complete Laravel Nova application with many modules. Deployed to a server or Vapor. | A multi-module SaaS platform |
| `module` | Single bounded-context package within an app. Handles one business subdomain. | `opscale-co/nova-loan-module` |
| `package` | Standalone project with specific functionality. Can have domain, Nova, Actions. | `nova-api`, `nova-authorization` |
| `library` | Pure utility/infrastructure code. No domain, no Nova, no Actions. | `opscale-co/strict-rules`, `opscale-co/actions` |

**When `PROJECT_TYPE` is `package`:**
- Full spec-driven sequence applies (same as module)
- The difference from module is that a package is standalone — not a subdomain of a specific app

**When `PROJECT_TYPE` is `library`:**
- Skip Steps 1–8 (map, spec, DBML, BPMN, SIPOC, domain, Nova, logic)
- The next step after init is writing code directly, then `opscale-release` (the per-layer tests domain/logic/ui author do not apply — a library has no Nova/Action layers)
- `MODULE_PREFIX` is the package slug instead of a DB table prefix

### Deployment model — single-tenant by design

All Opscale modules assume one independent database per implementation. There is NO `tenant_id` column, no per-row tenant scoping, no shared-database isolation strategy. Each consuming application provisions its own database; cross-customer data sharing is an infrastructure concern (replication / BI / regulator pipelines), not a module-layer concern.

### Joining an existing project

The Opscale workflow can be applied to projects that already have code. When adopting:

1. **Run `opscale-init`** in the existing project root — it detects existing files and uses `--here --force`.
2. **Join at any step** — see Phase 9 below for the entry-point recommendation matrix. If the project already has models and migrations, start at a later step (e.g. `opscale-process` to reverse-document what exists, or `opscale-domain` if the domain still needs models plus their Unit tests).
3. **Generation agents detect existing files** — identical files are skipped, files with extra content are merged (preserving additions), conflicting files are flagged for user review and never silently overwritten.
4. **Existing code is the source of truth** until the spec catches up — do not delete or overwrite working code to match a new spec. Update the spec to reflect reality, then iterate.
5. **Incremental adoption** is valid — apply Opscale conventions to one module at a time in an app. Not every module needs to be spec-driven on day one.

## Steps

### Phase 1 — Configure MCP servers

Opscale agents use three MCP servers for reasoning, testing, and memory. Verify they are configured and install them if missing.

**1a. Determine the project settings path:**

The Claude Code project settings live at:
`~/.claude/projects/{encoded-project-path}/settings.json`

where `{encoded-project-path}` is the absolute project path with `/` replaced by `-` and the leading `-` preserved. For example:
`/Users/nelson/Projects/Opscale/my-module` → `~/.claude/projects/-Users-nelson-Projects-Opscale-my-module/settings.json`

**1b. Check if settings.json exists and has MCP servers:**

Read the file. If it doesn't exist or is missing the `mcpServers` key, create or update it with the following configuration:

```json
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    "sqlite": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite", "{project_dir}/.data/opscale.db"]
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```

Replace `{project_dir}` with the absolute path to the project root.

If the file already exists with other settings, **merge** the `mcpServers` key — do not overwrite existing settings.

**1c. Create the .data directory:**

```bash
mkdir -p {project_dir}/.data
```

Add `.data/` to `.gitignore` if not already present.

**1d. Pre-download the packages** (so first agent run is fast):

```bash
npx -y @modelcontextprotocol/server-sequential-thinking --help 2>/dev/null
npx -y @modelcontextprotocol/server-sqlite --help 2>/dev/null
npx -y @modelcontextprotocol/server-memory --help 2>/dev/null
```

**1e. Report status:**

```
MCP Servers:
  [x] sequential-thinking — step-by-step reasoning for code generators
  [x] sqlite              — structured test results at .data/opscale.db
  [x] memory              — persistent knowledge graph across sessions

Note: restart Claude Code session for MCP servers to activate.
```

**Wait for user approval before continuing.**

### Phase 2 — Install spec-kit

Run the spec-kit CLI installer:

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
```

Verify installation:

```bash
specify --version
```

If already installed and the user wants to upgrade:

```bash
uv tool install specify-cli --force --from git+https://github.com/github/spec-kit.git
```

**Wait for user approval before continuing.**

### Phase 3 — Initialize the project scaffold

Navigate to the project root and initialize spec-kit for Claude Code:

```bash
# If starting fresh in a new directory
specify init <project-name> --ai claude

# If initializing inside an existing Opscale project
specify init . --ai claude
# or
specify init --here --ai claude

# If the directory already has files (most common for existing projects)
specify init --here --force --ai claude
```

After this step, the following structure exists:

```
.specify/
├── memory/
│   └── constitution.md        ← We will overwrite this in Phase 4
├── scripts/
│   ├── check-prerequisites.sh
│   ├── common.sh
│   ├── create-new-feature.sh
│   ├── setup-plan.sh
│   └── update-claude-md.sh
├── specs/                     ← Each module gets a subfolder here
└── templates/
    ├── plan-template.md
    ├── spec-template.md
    └── tasks-template.md
```

**Wait for user approval before continuing.**

### Phase 4 — Write the Opscale constitution

**Replace** the default `.specify/memory/constitution.md` with the Opscale-specific version below. This is the file Claude Code reads before making any decision.

Read the full constitution template from:
`references/constitution-template.md` (in this skill's directory)

Fill in the following values before writing:

| Token | Value |
|-------|-------|
| `[PROJECT_NAME]` | Name of the Opscale module or project |
| `[PROJECT_TYPE]` | `app`, `module`, `package`, or `library` — see Context |
| `[MODULE_PREFIX]` | Short snake_case prefix for DB tables (e.g. `loans`, `kyc`, `loyalty`). For `library` type, use the package slug (e.g. `actions`, `strict-rules`) |
| `[APP_LOCALE]` | Default app locale (e.g. `es`, `en`, `pt`). Default: `es`. Drives `config/app.php`, `lang/{locale}.json`, and the language every later skill writes in. |
| `[WORKBENCH_LOCALE]` | Locale the workbench / Nova UI runs in. Default: same as `[APP_LOCALE]`. Used by `opscale-showcase` to label demo data. |
| `[DATE]` | Today's date (ISO format) |

If `[APP_LOCALE]` or `[WORKBENCH_LOCALE]` were not provided in context, **ask the user** before writing the constitution — these values lock the language of every downstream artifact (spec narratives, Nova labels, action descriptions) and changing them later requires a sweep across the whole module.

Ask the user for these values if not already provided in context.

#### Phase 4b — Establish package conventions (modules/packages only)

For module/package projects, establish the package conventions. The full procedure lives in `references/package-conventions.md` — read it when the project type is `package` or `module`.

#### Phase 4c — Configure the commit & release standard

Every Opscale skill commits its work, so the commit standard must exist from the start — not at the end. Configure it now:

```bash
# Conventional Commits enforcement + git hooks
npm install --save-dev @commitlint/cli @commitlint/config-conventional husky
npx husky init

# Semantic versioning / changelog / publishing (config now; CI runs it later)
npm install --save-dev semantic-release \
    @semantic-release/changelog @semantic-release/git \
    @semantic-release/github @semantic-release/exec
```

Then copy the templates and wire the commit-message hook:

```bash
cp references/commitlint.config.mjs ./commitlint.config.mjs
cp references/.releaserc.json ./.releaserc.json
printf '#!/bin/sh\nnpx --no -- commitlint --edit "$1"\n' > .husky/commit-msg
```

This makes every later commit follow Conventional Commits and gives `semantic-release` its config. SonarQube and the GitHub Actions deploy workflows are configured later by `opscale-release`, which reuses this same `.releaserc.json`. The linter configuration itself (Duster, Pint, Larastan, Rector, lint-staged, ESLint) is set up in the very next step.

#### Phase 4d — Configure code-quality tooling

Linter and static-analysis configuration is installed here, on day 1 — not at release time. **Why:** every Opscale skill commits its work; deferring formatter/linter config to `opscale-release` would mean weeks of unstyled, unanalyzed code that then has to be retro-fixed in one giant noisy diff. Day-1 commits should already pass the formatter.

Install PHP tooling (all projects) + JS tooling (skip for `library`), wire the `.husky/pre-commit` hook, then copy six canonical config files (`duster.json`, `pint.json`, `rector.php`, `phpstan.neon`, `lint-staged.config.mjs`, `.eslintrc.cjs`) into the project root.

For the verbatim install commands, hook wiring, and the six config blocks, see `references/linting-configs.md`. The first four files also exist as standalone copies in `references/` for direct `cp`.

After this step, `vendor/bin/duster lint`, `vendor/bin/pint --test`, `vendor/bin/phpstan analyse`, and `vendor/bin/rector --dry-run` all run cleanly against the empty scaffold, and the pre-commit hook auto-fixes staged files going forward. `opscale-release` later wires the CI workflows that invoke these same configs in PRs.

#### Phase 4e — Configure the debug tooling

Debug tooling is set up here, on day 1, so every later skill can inspect how the code behaves without a separate setup pass. Each tool targets one layer of the stack, and **nothing here reaches production** — every config is `--dev` and environment-gated (`local` + `staging` only; `testing` too for packages). Skip this phase for `library` projects.

| Tool | Debugs | Install |
|------|--------|---------|
| **Nova DevTool / workbench** | the UI (Nova screens, fields, menu) | `composer require laravel/nova-devtool --dev` — reuse the same workbench the test harness builds; do not build a second one |
| **Telescope** | the domain (jobs, events, queries, model lifecycle) | `composer require laravel/telescope --dev` + `php artisan telescope:install` + `php artisan migrate` |
| **Debugbar** | in-browser queries/routes/timing, **local only** | `composer require barryvdh/laravel-debugbar --dev` |
| **Xdebug** | step-through of Action code (port **9003**) | system PHP extension or Sail `SAIL_XDEBUG_MODE`; IDE listens on 9003 |

Register Telescope in the **project-type-appropriate provider** (never `bootstrap/providers.php`): `app` → `app/Providers/AppServiceProvider.php`; `module`/`package` → `workbench/app/Providers/WorkbenchServiceProvider.php` (packages have no `app/Providers/`). Always guard registration and the `viewTelescope` gate with `app()->environment(['local','staging'])`; on staging, record only exceptions/failed requests/failed jobs/slow queries and hide sensitive headers and params. Also register the debug MCP dev servers (`koriym/xdebug-mcp`, `@playwright/mcp`, `laravel/boost`) in `.claude/settings.json` (development-only), and publish the Nova locale files for the workbench locale so demos and step-through render in the stakeholder's language.

The full `TelescopeServiceProvider` (gate + filtering + tags), `config/telescope.php` / `config/debugbar.php` settings, the Xdebug `php.ini` / `.vscode/launch.json` blocks, the three MCP server configs, and the workbench-locale block live in `references/debug-configs.md`.

#### Phase 4f — Configure the test harness

Configure (do NOT yet generate) the full testing / quality stack so `composer run test`, `composer run test:browser`, and `composer run check` exist and run against the empty scaffold from day 1. The individual test files are authored later by the Generate skills that own each layer (`opscale-domain` → Unit, `opscale-logic` → Feature, `opscale-ui` → Browser). Skip the Nova/Dusk parts for `library` projects (keep the lean Pest + phpstan stack).

Install the test-stack `require-dev` (Pest + `pest-plugin-laravel`, `orchestra/testbench-dusk`, `mockery`, `larastan/larastan`, `opscale-co/strict-rules`, `tightenco/duster`, `rector/rector`), set `config.allow-plugins.pestphp/pest-plugin` and the Nova `repositories` entry, then copy verbatim from `references/test-configs.md`:

- `phpunit.xml` (Unit + Feature + Browser) and `phpunit.dusk.xml` (Browser only) — both force `APP_LOCALE={locale}` from the constitution; `testbench.yaml` — provider list + `env: APP_LOCALE` + the load-bearing `workbench:` build sequence.
- `tests/TestCase.php`, `tests/DuskTestCase.php` (headless-by-default `driver()`, `submitForm()`/`assertNoErrorToast()`/`waitForAnywhere()` macros, `loginToNova()`, `openAction()`/`runAction()` toolbar helpers), `tests/Pest.php` (Unit + Feature only), `tests/Helpers.php` (`executeAction()` + `bindFakeContracts()` stub, registered in composer `autoload-dev.files`); `phpstan.neon` — **level 9**, all four `strict-rules` sets, `--memory-limit=512M`; ChromeDriver matched to the local Chrome major (`testbench dusk:chrome-driver`).
- The composer `scripts` block (`build`, `serve`, `lint`, `fix`, `refactor`, `analyse`, `test`, `test:unit`, `test:feature`, `test:browser`, `test:browser:visual`, `check`, `showcase`) and the `package.json` mirror.

After this phase a fresh clone can `composer install` then `composer run build` + `composer run check` against the empty scaffold; `opscale-release` later wires the CI workflows that invoke these same scripts.

**Wait for user approval before continuing.**

### Phase 5 — Verify the scaffold

Run spec-kit's built-in check:

```bash
specify check
```

Then confirm Claude Code can see the slash commands by opening it in the project root.
The following commands must be available:

- `/speckit.constitution`
- `/speckit.specify`
- `/speckit.clarify`
- `/speckit.plan`
- `/speckit.tasks`
- `/speckit.implement`
- `/speckit.analyze`

**Wait for user approval before continuing.**

### Phase 6 — Create the Plan intake folder (`docs/plan/`)

Plan-phase artifacts live in a **flat, exportable `docs/plan/` folder** — plain documents, stack-agnostic, one module per `docs/plan/` (multi-module apps keep one per module repo). Spec-kit keeps only its own files under `.specify/` (constitution, `business-types.php`, `plan.md` / `tasks.md`, scripts, templates). Canonical layout and per-file formats: `references/artifact-paths.md`.

**6a. Create the intake folder and its manifest:**

```bash
mkdir -p docs/plan/context
cp references/plan-readme.md docs/plan/README.md   # skip if it already exists
```

`docs/plan/README.md` is the folder's **manifest**: it documents which skill produces which file, in which order, so the folder "expects" the outputs before any of them exist. It is also the landing zone for files downloaded from a Claude Desktop planning session — the user drops them here and the pipeline continues from them. In pipeline order:

| # | Skill | Produces (under `docs/plan/`) |
|---|-------|-------------------------------|
| 1 | `opscale-map` | `context/system.map.md` |
| 2 | `opscale-process` | `process.mmd` + `process.txt` (+ `context/names.md`) |
| 3 | `opscale-dbml` | `dbml.dbml` + `dbml.txt` + `context/external-refs.md` |
| 4 | `opscale-bpmn` | `bpmn.bpmn` + `bpmn.txt` |
| 5 | `opscale-sipoc` | `sipoc/{kebab-id}.md` (one per Logic) + `sipoc.txt` |
| 6 | `opscale-ontology` | `ontology.mmd` + `ontology.txt` (Plan closer) |

Do not pre-create `sipoc/` or empty artifact files — the Plan skills create them when they run.

**6b. Recognize pre-existing Plan artifacts.** If `docs/plan/` already contains Plan artifacts when init runs (typically brought from a Claude Desktop planning session), do NOT demand the Plan phase be re-run. Compare the folder's contents against the manifest table and report which Plan steps are already satisfied and where the pipeline resumes:

```
Plan intake — docs/plan/ already contains artifacts:
  [x] opscale-map      — context/system.map.md
  [x] opscale-process  — context/names.md + process.txt
  [ ] opscale-dbml     — missing
  [ ] opscale-bpmn     — missing
  [ ] opscale-sipoc    — missing
  [ ] opscale-ontology — missing

Plan steps 1–2 satisfied. Resume the pipeline at opscale-dbml.
```

Never overwrite files already present in `docs/plan/` — they are the source the rest of the pipeline reads.

**6c. Business-types registry.** Copy two files — **skip any that already exist** (never overwrite a project's extended copies):

1. `references/business-types.md` → `docs/plan/context/business-types.md` — the **canonical, language-agnostic registry**: one slug per business type with meaning, storage, validation semantics, and UI intent. This is what the Plan phase reads: `opscale-dbml` uses the slugs directly as DBML column types, `opscale-sipoc` types Action inputs and outputs with them. Plan artifacts reference slugs only — never a class or framework rule.
2. `references/business-types.php` → `.specify/memory/business-types.php` — the **Laravel/Nova implementation binding** of that registry (concrete field classes, validation rule strings, casts). Stays on the spec-kit side. Consumed only by Generate: `opscale-domain` (casts/rules), `opscale-ui` (field selection), `opscale-logic` (`parameters()` rules).

Registry first, binding second — a slug missing from either side fails the Generate gates.

**Wait for user approval before continuing.**

### Phase 7 — Open the MVP feature

Init closes by opening the project's **first feature** with spec-kit — the first version of the subdomain, the **MVP**. Run spec-kit's specify command with `mvp` as the feature name so it scaffolds `.specify/specs/001-mvp/`:

```bash
/speckit.specify mvp — the first working version of {MODULE_NAME}
```

This produces `.specify/specs/001-mvp/` with spec-kit's own `spec.md` (later `/speckit.plan` + `/speckit.tasks` runs add `plan.md` + `tasks.md`). The feature name is `mvp`; the folder is `001-mvp`. If Plan artifacts already exist in `docs/plan/` (Phase 6b), the MVP spec is written from them; otherwise it captures the intended first version from the user's description.

`opscale-domain`, `opscale-logic`, and `opscale-ui` **add their tasks to this same feature** (`001-mvp`) — they do not open new features; the MVP is built up layer by layer inside it. Every **later** change or fix goes through `opscale-iterate`, which opens the next numbered features (`002-…`, `003-…`). `001-mvp` is only ever the initial build.

**Wait for user approval before continuing.**

### Phase 8 — Map the Opscale sequence to spec-kit commands

Explain to the user how the Opscale skill sequence maps to spec-kit's workflow:

```
OPSCALE SKILL           → ARTIFACT
─────────────────────────────────────────────────────────────────────────
# Plan phase — no init required; writes flat, exportable docs/plan/
opscale-map             → docs/plan/context/system.map.md (app-level; re-run before each new module)
opscale-process         → docs/plan/process.mmd + process.txt (+ context/names.md)
opscale-dbml            → docs/plan/dbml.dbml (+ dbml.txt, context/external-refs.md)
opscale-bpmn            → docs/plan/bpmn.bpmn (+ bpmn.txt)
opscale-sipoc           → docs/plan/sipoc/{kebab-id}.md (+ sipoc.txt)
opscale-ontology        → docs/plan/ontology.mmd (+ ontology.txt) (Plan closer)
                          /speckit.clarify   ← validate before planning
# Generate phase — builds the MVP feature .specify/specs/001-mvp/
opscale-init (THIS)     → env + test/debug harness + .specify/specs/001-mvp/spec.md
opscale-domain          ↘
opscale-logic         → .specify/specs/001-mvp/plan.md + tasks.md (each layer adds its tasks)
opscale-ui              ↗
                          /speckit.analyze   ← cross-artifact consistency check
                          /speckit.tasks     ← generate task breakdown
                          /speckit.implement ← Claude Code builds it
opscale-release         → CI / SonarQube / semantic-release (Review; requires tests)
# Later changes / fixes:
opscale-iterate         → next features .specify/specs/002-…, 003-…

# Independent (not part of the sequence):
opscale-ai              → .claude/skills/{slug}-setup.md (installer skill for consumers)
```

Debug and test tooling are no longer separate configuration steps — init configures both (Phases 4e / 4f); the Generate skills author the test files for the layer they own. Plan artifacts live flat in `docs/plan/` (one per module repo — see `references/artifact-paths.md`). The initial build lives under `.specify/specs/001-mvp/`; `opscale-iterate` opens the higher-numbered folders (`002-…`, `003-…`) for later changes. Each holds only spec-kit's own `spec.md` / `plan.md` / `tasks.md`, written by the `/speckit.*` commands.

**Wait for user approval before continuing.**

### Phase 9 — Existing project assessment (existing projects only)

When running on an existing project that already has code, perform an assessment before proceeding to the next skill:

**9a. Scan existing code structure:**

```
Existing project assessment:

Source directory: [src/ or app/]
├── Models:      [count] found
├── Migrations:  [count] found
├── Nova:        [count] resources found
├── Actions:     [count] found
├── Tests:       [count] found
├── Enums:       [count] found
├── Repositories: [count] found
```

**9b. Determine the entry point:**

Based on what exists, recommend where to join the sequence:

| What exists | Recommended entry point |
|-------------|------------------------|
| Nothing — greenfield | `opscale-process` (Plan phase) |
| Plan artifacts already in `docs/plan/` (e.g. from a Claude Desktop planning session) | First missing Plan step per the Phase 6b report — do not re-run satisfied steps |
| Business docs but no code | `opscale-process` (formalize into spec) |
| Models + migrations but no spec | `opscale-process` (reverse-document what exists) |
| Models + migrations + spec | `opscale-dbml` (formalize data model from existing schema) |
| Full Plan artifacts, no PHP yet | `opscale-domain` (first Generate code step) |
| Full domain + Nova but no CI | `opscale-release` (Review; test config already set up here) |
| Everything exists, adopting conventions | Run `constitution-enforcer` to assess compliance |

**9c. Present the recommendation:**

```
Recommended entry point: Step [N] — [skill_name]

Reason: [explanation based on what was found]

Existing code will be preserved. Generation agents will:
- Skip files that already exist and match
- Merge additions into existing files
- Flag conflicts for your review

Proceed with [skill_name]?
```

**Wait for user approval before continuing.**

## Sample

Constitution + `.specify` scaffold tree — see `references/sample-output.md`.

## Success condition

```bash
node scripts/validate-init.mjs --project-root=.
```

Exit code 0 = pass.
