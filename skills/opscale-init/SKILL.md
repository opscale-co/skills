---
name: opscale-init
description: >
  Bootstraps an Opscale/Laravel Nova module for Spec-Driven Development. Step 0 —
  must run before every other Opscale skill. Trigger: "start a new module", "set
  up spec-kit", "initialize the project", "create the constitution".
  Use it whenever a new Opscale module is started, even if phrased as "set this up". Not for adding features to an already-initialized project — that's opscale-iterate.
---

# opscale-init

## Context

### Purpose

Bootstrap a new Opscale module or project with GitHub spec-kit's Spec-Driven Development scaffold, then write an Opscale-specific `constitution.md` that encodes the architectural DNA Claude Code must follow across every skill in the sequence.

The constitution is the single most important file in the project. Every subsequent skill (`opscale-process`, `opscale-dbml`, `opscale-bpmn`, etc.) produces artifacts that Claude Code validates against it. Getting it right once here prevents drift across the entire development lifecycle.

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
- The next step after init is writing code directly, then `opscale-test` and `opscale-release`
- `MODULE_PREFIX` is the package slug instead of a DB table prefix

### Deployment model — single-tenant by design

All Opscale modules assume one independent database per implementation. There is NO `tenant_id` column, no per-row tenant scoping, no shared-database isolation strategy. Each consuming application provisions its own database; cross-customer data sharing is an infrastructure concern (replication / BI / regulator pipelines), not a module-layer concern.

### Joining an existing project

The Opscale workflow can be applied to projects that already have code. When adopting:

1. **Run `opscale-init`** in the existing project root — it detects existing files and uses `--here --force`.
2. **Join at any step** — see Phase 8 below for the entry-point recommendation matrix. If the project already has models and migrations, start at a later step (e.g. `opscale-process` to reverse-document what exists, or `opscale-test` if the domain is built but untested).
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
| `[WORKBENCH_LOCALE]` | Locale the workbench / Nova UI runs in. Default: same as `[APP_LOCALE]`. Used by `opscale-seed` and `opscale-showcase` to label demo data. |
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

### Phase 6 — Establish the per-module spec layout

Every module folder under `.specify/specs/{NNN}-{module-name}/` follows the same split: `logs/` for phase-by-phase Q/A records, `final/` for the canonical downstream-consumable artifacts. Spec-kit's own `plan.md` / `tasks.md` live at the spec root.

```
.specify/specs/{NNN}-{module-name}/
├── plan.md                       ← spec-kit: tech decisions (live)
├── tasks.md                      ← spec-kit: ordered task breakdown (live)
├── logs/                         ← phase-by-phase Q/A records (replaced each run)
│   ├── process.md
│   ├── dbml.md
│   ├── bpmn.md
│   └── sipoc.md
└── final/                        ← canonical, downstream-consumable artifacts
    ├── process.md                ← opscale-process spec
    ├── domain.dbml               ← raw DBML
    ├── external-refs.md          ← cross-subdomain ref index (only if ≥1 ref)
    ├── process.bpmn              ← raw BPMN 2.0 XML
    └── actions/
        └── {kebab-id}.sipoc.md   ← one per businessRuleTask
```

Canonical paths reference: `references/artifact-paths.md`.

**Logs vs. final:**

| Folder | Lifecycle | Read by |
|--------|-----------|---------|
| `final/` | **Live** — overwritten by every re-run and iteration | Downstream skills (domain, ui, logic, test, sipoc) and BPMN/DBML tooling |
| `logs/` | **Replaced each run** — the Q/A record of how the live artifact was produced | Humans auditing decisions; `opscale-iterate` when continuing a module |

`opscale-iterate` records iteration narrative separately in its own iteration log (see that skill); the four Plan skills do NOT write iteration narratives.

When initializing the project, do NOT pre-create empty `logs/` or `final/` folders — they appear naturally the first time `opscale-process`, `opscale-dbml`, `opscale-bpmn`, or `opscale-sipoc` run for a given module. This step just documents the convention so every downstream skill follows it.

**Business-types registry.** Copy two files into `.specify/memory/` — **skip any that already exist** (never overwrite a project's extended copies):

1. `references/business-types.md` → `.specify/memory/business-types.md` — the **canonical, language-agnostic registry**: one slug per business type with meaning, storage, validation semantics, and UI intent. This is what the Plan phase reads: `opscale-dbml` types entity attributes with it (`// type:{slug}` notes), `opscale-sipoc` types Action inputs. Plan artifacts reference slugs only — never a class or framework rule.
2. `references/business-types.php` → `.specify/memory/business-types.php` — the **Laravel/Nova implementation binding** of that registry (concrete field classes, validation rule strings, casts). Consumed only by Generate: `opscale-domain` (casts/rules), `opscale-ui` (field selection), `opscale-logic` (`parameters()` rules).

Registry first, binding second — a slug missing from either side fails the Generate gates.

**Wait for user approval before continuing.**

### Phase 7 — Map the Opscale sequence to spec-kit commands

Explain to the user how the Opscale skill sequence maps to spec-kit's workflow:

```
OPSCALE SKILL           → ARTIFACT
─────────────────────────────────────────────────────────────────────────
opscale-map             → .specify/memory/domain-map.md (Step 1, app-level; re-run before each new module)
opscale-process         → .specify/specs/{NNN-module}/final/process.md
                          .specify/specs/{NNN-module}/logs/process.md
opscale-dbml            → .specify/specs/{NNN-module}/final/domain.dbml
                          .specify/specs/{NNN-module}/final/external-refs.md
                          .specify/specs/{NNN-module}/final/naming.md
                          .specify/specs/{NNN-module}/logs/dbml.md
opscale-bpmn            → .specify/specs/{NNN-module}/final/process.bpmn
                          .specify/specs/{NNN-module}/final/operations.md
                          .specify/specs/{NNN-module}/logs/bpmn.md
opscale-sipoc           → .specify/specs/{NNN-module}/final/actions/{id}.sipoc.md
                          .specify/specs/{NNN-module}/logs/sipoc.md
                          /speckit.clarify  ← validate before planning
opscale-domain          ↘
opscale-ui            → .specify/specs/{NNN-module}/plan.md
opscale-logic           ↗
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

**Wait for user approval before continuing.**

### Phase 8 — Existing project assessment (existing projects only)

When running on an existing project that already has code, perform an assessment before proceeding to the next skill:

**8a. Scan existing code structure:**

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

**8b. Determine the entry point:**

Based on what exists, recommend where to join the sequence:

| What exists | Recommended entry point |
|-------------|------------------------|
| Nothing — greenfield | Step 2: `opscale-process` |
| Business docs but no code | Step 2: `opscale-process` (formalize into spec) |
| Models + migrations but no spec | Step 2: `opscale-process` (reverse-document what exists) |
| Models + migrations + spec | Step 3: `opscale-dbml` (formalize data model from existing schema) |
| Full domain + Nova but no tests | Step 10: `opscale-test` |
| Full domain + Nova + tests but no CI | Step 11: `opscale-release` |
| Everything exists, adopting conventions | Run `constitution-enforcer` to assess compliance |

**8c. Present the recommendation:**

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
