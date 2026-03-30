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
| `[TENANT_AWARE]` | `yes` or `no` — does this module scope data by tenant? For `library` type, always `no` |
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
- `TENANT_AWARE` is always `no`
- `MODULE_PREFIX` is the package slug instead of a DB table prefix

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

### Step 6 — Map the Opscale sequence to spec-kit commands

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

### Step 7 — Existing project assessment (existing projects only)

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
- ✅ (Existing projects) Entry point identified based on current code state

The next step depends on project state:
- **New projects**: `opscale-process` for the first module
- **Existing projects**: The step identified in the assessment (Step 7)
