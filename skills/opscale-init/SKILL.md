---
name: opscale-init
description: >
  Bootstraps a new Opscale/Laravel Nova module or project for Spec-Driven Development
  using GitHub spec-kit. Use this skill whenever starting a new Opscale module from
  scratch, setting up spec-kit in an existing Opscale project, or creating the
  constitution.md for an Opscale codebase. Also trigger when the user says "let's
  start a new module", "set up spec-kit", "initialize the project", or "create the
  constitution". This skill MUST run before any other Opscale skill in the sequence.
  It installs spec-kit, generates the .specify/ scaffold, and writes an
  Opscale-specific constitution.md that Claude Code will reference throughout all
  subsequent development phases.
---

# opscale-init

## Purpose

Bootstrap a new Opscale module or project with GitHub spec-kit's Spec-Driven Development
scaffold, then write an Opscale-specific `constitution.md` that encodes the architectural
DNA Claude Code must follow across every skill in the sequence.

The constitution is the single most important file in the project. Every subsequent skill
(`opscale-process`, `opscale-dbml`, `opscale-bpmn`, etc.) produces artifacts that Claude
Code validates against it. Getting it right once here prevents drift across the entire
development lifecycle.

---

## Prerequisites

### Project context — MUST be a Laravel/PHP project

`opscale-init` **assumes the current working directory is already an existing
PHP/Laravel project**. It does not bootstrap a Laravel app from scratch. Before
doing anything else, verify:

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

If `composer.json` is missing, **stop and refuse to proceed** — instruct the
user to first create the Laravel project (`composer create-project laravel/laravel .`
or `composer init` for a package) and then re-run `/opscale-init`.

If Laravel is not detected but `composer.json` exists, ask the user to confirm
the project type (`app` / `module` / `package` / `library`) and proceed only if
they explicitly confirm — `opscale-*` skills only produce useful output in
Laravel contexts.

### Tooling

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

---

## Workflow

### Step 1 — Configure MCP servers

Opscale agents use three MCP servers for reasoning, testing, and memory. Verify
they are configured and install them if missing.

**1a. Determine the project settings path:**

The Claude Code project settings live at:
`~/.claude/projects/{encoded-project-path}/settings.json`

where `{encoded-project-path}` is the absolute project path with `/` replaced by `-`
and the leading `-` preserved. For example:
`/Users/nelson/Projects/Opscale/my-module` → `~/.claude/projects/-Users-nelson-Projects-Opscale-my-module/settings.json`

**1b. Check if settings.json exists and has MCP servers:**

Read the file. If it doesn't exist or is missing the `mcpServers` key, create or
update it with the following configuration:

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

If the file already exists with other settings, **merge** the `mcpServers` key —
do not overwrite existing settings.

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

---

### Step 2 — Install spec-kit

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

---

### Step 3 — Initialize the project scaffold

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
│   └── constitution.md        ← We will overwrite this in Step 4
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

---

### Step 4 — Write the Opscale constitution

**Replace** the default `.specify/memory/constitution.md` with the Opscale-specific
version below. This is the file Claude Code reads before making any decision.

Read the full constitution template from:
`references/constitution-template.md` (in this skill's directory)

Fill in the following values before writing:

| Token | Value |
|-------|-------|
| `[PROJECT_NAME]` | Name of the Opscale module or project |
| `[PROJECT_TYPE]` | `app`, `module`, `package`, or `library` — see below |
| `[MODULE_PREFIX]` | Short snake_case prefix for DB tables (e.g. `loans`, `kyc`, `loyalty`). For `library` type, use the package slug (e.g. `actions`, `strict-rules`) |
| `[DATE]` | Today's date (ISO format) |

**Project type definitions:**

| Type | Use for | Example |
|------|---------|---------|
| `app` | Complete Laravel Nova application with many modules. Deployed to a server or Vapor. | A multi-module SaaS platform |
| `module` | Single bounded-context package within an app. Handles one business subdomain. | `opscale-co/nova-loan-module` |
| `package` | Standalone project with specific functionality. Can have domain, Nova, Actions. | `nova-api`, `nova-authorization` |
| `library` | Pure utility/infrastructure code. No domain, no Nova, no Actions. | `opscale-co/strict-rules`, `opscale-co/actions` |

Ask the user for these values if not already provided in context.

**When `PROJECT_TYPE` is `package`:**
- Full spec-driven sequence applies (same as module)
- The difference from module is that a package is standalone — not a subdomain of a specific app

**When `PROJECT_TYPE` is `library`:**
- Skip Steps 1–6 (no spec, DBML, BPMN, domain, Nova, logic)
- The next step after init is writing code directly, then `opscale-test` and `opscale-release`
- `MODULE_PREFIX` is the package slug instead of a DB table prefix

**Deployment model — single-tenant by design.** All Opscale modules assume one
independent database per implementation. There is NO `tenant_id` column, no
per-row tenant scoping, no shared-database isolation strategy. Each consuming
application provisions its own database; cross-customer data sharing is an
infrastructure concern (replication / BI / regulator pipelines), not a
module-layer concern.

---

### Step 4b — Establish package conventions (modules/packages only)

When `PROJECT_TYPE` is `module` or `package`, the workbench-based development
loop (`testbench serve`, `testbench dusk:*`, Browser tests) requires three
opinionated defaults that downstream skills assume. Set them now so they
don't have to be patched in later.

#### 4b.1 — Migrations live at `database/migrations/` (package root)

Opscale convention: migrations live at the **package root** in
`database/migrations/`, NOT in `src/Database/Migrations/`. This matches
Laravel's host-app convention and lets `discoversMigrations()` in the
package service provider work without extra wiring.

```bash
mkdir -p database/migrations
```

#### 4b.2 — `testbench.yaml` providers (Nova + Inertia + Fortify + Dusk)

The Dusk server in `testbench-dusk` boots a fresh Laravel app per request and
loads providers ONLY from `testbench.yaml`. Missing providers fail SILENTLY
with 500 errors that don't reach Laravel's log. Default them now:

```yaml
laravel: '@testbench'

env:
  - APP_LOCALE=es
  - APP_FALLBACK_LOCALE=es
  - APP_FAKER_LOCALE=es_ES

providers:
  - Inertia\ServiceProvider                    # Nova uses Inertia (@inertia blade directive)
  - Laravel\Fortify\FortifyServiceProvider     # Nova auth uses Fortify (StatefulGuard binding)
  - Laravel\Dusk\DuskServiceProvider           # provides _dusk/login for loginAs()
  - Laravel\Nova\NovaCoreServiceProvider
  - Laravel\Nova\NovaServiceProvider
  - Workbench\App\Providers\WorkbenchServiceProvider
  - Workbench\App\Providers\NovaServiceProvider
  - {PackageNamespace}\SubdomainServiceProvider

seeders:
  - Workbench\Database\Seeders\DatabaseSeeder

workbench:
  start: /nova
  build:
    - package:discover
    - asset-publish
    - create-sqlite-db
    - db:wipe
    - migrate:refresh
    - 'db:seed --class="Workbench\Database\Seeders\DatabaseSeeder"'
  assets:
    - nova-assets
  sync: []

purge:
  directories:
    - lang/*
    - public/vendor/*
```

Replace `{PackageNamespace}` with the package's PHP namespace
(e.g. `Unicoop\Teller`). If `testbench.yaml` already exists, merge — do NOT
overwrite custom env/seeder entries.

#### 4b.3 — Pre-flight backup when reinitializing an existing module

If the target directory already contains `src/`, `database/migrations/`, or
`tests/` populated, snapshot the module BEFORE scaffolding from zero — the
user often runs `opscale-init` against an existing module to rebuild it:

```bash
if [ -d src ] && [ "$(ls -A src 2>/dev/null)" ]; then
  STAMP=$(date +%Y%m%d-%H%M%S)
  rsync -a --exclude vendor --exclude node_modules ./ ../$(basename "$PWD").backup-$STAMP/
  echo "📦  Backup saved to ../$(basename "$PWD").backup-$STAMP/"
fi
```

The backup excludes `vendor/` and `node_modules/` so it's a few MB instead of
hundreds. It is meant for diffing the new flow against the previous state, not
for restoring — `git` covers that.

---

### Step 5 — Verify the scaffold

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

---

### Step 6 — Establish the per-module `docs/` convention

Every module folder under `.specify/specs/{NNN}-{module-name}/` MUST contain a
`docs/` subfolder that captures the human-readable history of the module:

```
.specify/specs/{NNN}-{module-name}/
├── spec.md             ← structured business spec (live)
├── data-model.md       ← DBML wrapped in narrative (live)
├── process.md          ← BPMN process map (live)
├── plan.md             ← tech decisions (live)
├── tasks.md            ← ordered task breakdown (live)
└── docs/               ← human-readable history (append-only narrative)
    ├── process.md      ← original narrative description from opscale-process
    ├── initial.dbml    ← frozen DBML snapshot from first run of opscale-dbml
    ├── initial.bpmn    ← frozen BPMN snapshot from first run of opscale-bpmn
    └── iterations/
        └── YYYY-MM-DD-<slug>.md   ← one file per iteration, date-prefixed
```

**Live vs. frozen artifacts:**

| Folder | Lifecycle | Read by |
|--------|-----------|---------|
| `.specify/specs/{NNN}/*.md` (top level) | **Live** — updated by every skill and iteration | Downstream skills (domain, ui, logic, test) |
| `.specify/specs/{NNN}/docs/` | **Frozen + append-only** — initial snapshots never change; iterations are written once and never edited | Humans onboarding to the module |

**Iteration file naming:** `YYYY-MM-DD-<short-kebab-slug>.md`. The date is
always absolute (resolve "today" to a concrete ISO date). `opscale-iterate`
writes these files; no other skill writes into `docs/iterations/`.

When initializing the project, do NOT pre-create empty `docs/` folders — they
appear naturally the first time `opscale-process`, `opscale-dbml`,
`opscale-bpmn`, or `opscale-iterate` run for a given module. This step just
documents the convention so every downstream skill follows it.

---

### Step 7 — Map the Opscale sequence to spec-kit commands

Explain to the user how the Opscale skill sequence maps to spec-kit's workflow:

```
OPSCALE SKILL           → SPEC-KIT ARTIFACT
─────────────────────────────────────────────────────
opscale-process         → .specify/specs/{NNN-module}/spec.md
opscale-dbml            → .specify/specs/{NNN-module}/data-model.md
opscale-bpmn            → .specify/specs/{NNN-module}/process.md
                          /speckit.clarify  ← validate before planning
opscale-domain          ↘
opscale-ui            → .specify/specs/{NNN-module}/plan.md
opscale-logic           ↗
opscale-outputs         → .specify/specs/{NNN-module}/contracts/
                          /speckit.analyze  ← cross-artifact consistency check
                          /speckit.tasks    ← generate task breakdown
opscale-debug           ↘
opscale-test            → .specify/specs/{NNN-module}/tasks.md
opscale-release         ↗
                          /speckit.implement ← Claude Code builds it

# Independent (not part of the sequence):
opscale-ai              → .claude/skills/{slug}-setup.md (installer skill for consumers)
```

Each module gets its own numbered folder: `001-membership`, `002-kyc`, `003-loans`, etc.

---

---

### Step 8 — Existing project assessment (existing projects only)

When running on an existing project that already has code, perform an assessment
before proceeding to the next skill:

**6a. Scan existing code structure:**

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

**6b. Determine the entry point:**

Based on what exists, recommend where to join the sequence:

| What exists | Recommended entry point |
|-------------|------------------------|
| Nothing — greenfield | Step 1: `opscale-process` |
| Business docs but no code | Step 1: `opscale-process` (formalize into spec) |
| Models + migrations but no spec | Step 1: `opscale-process` (reverse-document what exists) |
| Models + migrations + spec | Step 2: `opscale-dbml` (formalize data model from existing schema) |
| Full domain + Nova but no tests | Step 8: `opscale-test` |
| Full domain + Nova + tests but no CI | Step 9: `opscale-release` |
| Everything exists, adopting conventions | Run `constitution-enforcer` to assess compliance |

**6c. Present the recommendation:**

```
Recommended entry point: Step [N] — [skill_name]

Reason: [explanation based on what was found]

Existing code will be preserved. Generation agents will:
- Skip files that already exist and match
- Merge additions into existing files
- Flag conflicts for your review

Proceed with [skill_name]?
```

Wait for user confirmation before proceeding.

---

## Output

After completing this skill, the project contains:

- ✅ MCP servers configured (sequential-thinking, sqlite, memory)
- ✅ `specify` CLI installed and verified
- ✅ `.specify/` scaffold with Claude Code slash commands
- ✅ `.specify/memory/constitution.md` with Opscale principles
- ✅ User understands the module folder naming convention
- ✅ User knows which Opscale skill maps to which spec-kit artifact
- ✅ Per-module `docs/` convention established (process narrative, frozen DBML/BPMN snapshots, dated iteration log)
- ✅ (Existing projects) Entry point identified based on current code state

The next step depends on project state:
- **New projects**: `opscale-process` for the first module
- **Existing projects**: The step identified in the assessment (Step 8)
