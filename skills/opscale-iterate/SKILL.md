---
name: opscale-iterate
description: >
  Adds a new feature, change, or fix to an existing Opscale project end-to-end:
  collects a brief description from the user, drives spec-kit (/speckit.specify
  → /speckit.clarify → /speckit.plan → /speckit.tasks → /speckit.implement) to
  produce the execution plan, invokes the matching Opscale skills for each
  affected layer (process / dbml / bpmn / domain / ui / logic / test), and
  closes the iteration with a Conventional Commits commit compatible with
  semantic-release. Trigger this skill when the user says "let's iterate",
  "add a feature", "new iteration", "implement this change", "create a feature
  branch for X", "ship this small change", or describes a discrete piece of work
  on top of an already-initialized Opscale project. This is the iterative
  counterpart to the full Opscale sequence — use it when you do NOT want to run
  the whole pipeline from scratch.
---

# opscale-iterate

## Purpose

Take a single feature, change, or fix from idea → spec → plan → implementation →
commit, in one continuous, governed loop. Reuses every other Opscale skill and
the spec-kit slash commands — this skill is the orchestrator, not a code
generator.

The output is a **commit on the current branch** (or on a new feature branch the
user names) with a Conventional Commits message that `semantic-release` will
interpret correctly for the next release.

---

## Prerequisites — strict gate, no exceptions

`opscale-iterate` is only valid on a **feature-complete module**. It is NOT a
substitute for the initial pipeline. If any of the following fails, stop and
direct the user to the missing skill — do NOT attempt to iterate on an
incomplete module.

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | Current directory is a git repo | `git rev-parse --is-inside-work-tree` | Stop. `git init` (or move to the right directory). |
| 3 | Git tree is clean | `git status --porcelain` returns empty | Stop. Commit or stash before iterating. |
| 4 | `specify --version` resolves | Run the command | Re-run `/opscale-init` to install spec-kit. |
| 5 | **Plan phase complete** for at least one module | `.specify/specs/{NNN}-{slug}/spec.md`, `data-model.md`, `process.md` all exist and PASS | Stop. Run `/opscale-process` → `/opscale-dbml` → `/opscale-bpmn` first. |
| 6 | **Generate phase complete** for that module | `src/Models/` populated AND `src/Nova/` populated AND `src/Services/Actions/` populated (BPMN-driven modules) | Stop. Run `/opscale-domain` → `/opscale-ui` → `/opscale-logic` to finish the initial pipeline. |
| 7 | **Zero pending tasks** in the module's `tasks.md` | `grep -E '^\s*-\s*\[ \]' .specify/specs/{NNN}-{slug}/tasks.md` returns nothing | Stop. Finish the open tasks before iterating. Iteration on a half-built module breaks the spec-kit task ledger. |

```bash
# Quick gate check — run all of these green before proceeding
test -f .specify/memory/constitution.md                            && echo "1. init      OK"
git rev-parse --is-inside-work-tree >/dev/null 2>&1                && echo "2. git repo  OK"
[ -z "$(git status --porcelain)" ]                                 && echo "3. clean     OK"
specify --version >/dev/null 2>&1                                  && echo "4. spec-kit  OK"
ls .specify/specs/*/spec.md          >/dev/null 2>&1               && echo "5a. process  OK"
ls .specify/specs/*/data-model.md    >/dev/null 2>&1               && echo "5b. dbml     OK"
ls .specify/specs/*/process.md       >/dev/null 2>&1               && echo "5c. bpmn     OK"
ls src/Models/*.php                  >/dev/null 2>&1               && echo "6a. domain   OK"
ls src/Nova/*.php                    >/dev/null 2>&1               && echo "6b. ui       OK"
ls src/Services/Actions/*.php        >/dev/null 2>&1               && echo "6c. logic    OK"
! grep -rE '^\s*-\s*\[ \]' .specify/specs/*/tasks.md >/dev/null    && echo "7. tasks    OK (none pending)"
```

If `tasks.md` has unchecked items, the right answer is **finish the original
work**, not iterate around it. Iteration adds a new chapter to a complete book;
it does not write the previous chapters for you.

Once all 7 checks pass, read `.specify/memory/constitution.md` — the
`PROJECT_TYPE` determines which Opscale skills downstream Step 5 can invoke.

---

## Workflow

### Step 1 — Collect the iteration brief as a user story

Iterations are captured in **user-story format**. This is the contract — do not
accept a free-form sentence and feed it directly to spec-kit. If the user
provides a casual sentence, restructure it into the user-story template below
and confirm with them before proceeding.

**User story template:**

```
As a   [actor / persona — must match an actor from spec.md when possible]
I want [capability — what they can do that they cannot do today]
So that [outcome — the business value, in their words]

Acceptance criteria:
  - Given [precondition]
    When  [action]
    Then  [observable result]
  - Given ...
    When  ...
    Then  ...

Out of scope:
  - [what this iteration explicitly does NOT do]

Notes:
  - [optional — any constraints, deadlines, references]
```

**Collection flow (use `AskUserQuestion` per item):**

| Question | Purpose | Required |
|----------|---------|----------|
| Who is the actor? | First line of the story; should match an actor in spec.md | Yes |
| What capability do they need? | The "I want" — be specific | Yes |
| Why — what business outcome? | The "so that" — drives the commit body | Yes |
| Acceptance criteria (Given/When/Then) | Defines done for `/speckit.specify` | Yes — at least one |
| Out of scope | Bounds the iteration so it stays one commit | Optional |
| Change type | Drives the Conventional Commits prefix | Yes — see table below |
| Affected scope | DB tables / Nova resources / Actions involved | Optional |
| Breaking change? | Adds `BREAKING CHANGE:` footer → major release | Default no |
| Branch strategy | Stay on current branch / create new `iter/<slug>` branch | Default new branch |

If the user supplies a brief that isn't in user-story shape, **rewrite it into
the template and show them the rewrite before proceeding**:

> "I've structured your request as a user story — confirm or edit:
> ```
> As a Support Lead
> I want to triage incoming tickets by priority
> So that the team can act on high-priority items first
>
> Acceptance criteria:
>   - Given a ticket is created
>     When the support lead opens the ticket list
>     Then each ticket displays its priority badge (low/normal/high)
> ```"

**Change type → Conventional Commits prefix:**

| User intent | Prefix | semantic-release bump |
|-------------|--------|----------------------|
| New user-facing feature | `feat` | minor |
| Bug fix | `fix` | patch |
| Performance improvement | `perf` | patch |
| Refactor (no behavior change) | `refactor` | none |
| Tests only | `test` | none |
| Docs only | `docs` | none |
| Build / tooling | `build` or `chore` | none |
| CI config | `ci` | none |
| Code style only | `style` | none |

If the user is vague ("just improve this"), ask which prefix fits — never guess.
The prefix is what semantic-release reads; getting it wrong silently breaks the
release pipeline.

---

### Step 2 — Create the iteration branch (if requested)

Default: create a new branch named `iter/<short-kebab-slug>` derived from the
brief. Confirm the name with the user before creating.

```bash
git checkout -b iter/<slug>
```

If the user opted to stay on the current branch, skip this step but warn if the
current branch is `main` or `master` — those should usually not receive
iteration commits directly.

---

### Step 3 — Archive the user story into the target module's docs/iterations/

Identify the **target module** the iteration touches (use the spec folders under
`.specify/specs/`). If the iteration spans more than one module, ask the user
which one owns the story — there must be a single owner.

Then write the user story to a date-prefixed file in the module's docs folder:

```
.specify/specs/{NNN}-{module-name}/docs/iterations/YYYY-MM-DD-<short-kebab-slug>.md
```

**Filename rules:**
- `YYYY-MM-DD` — today's date in ISO format (the user's local date). NEVER use
  relative dates; always resolve "today" to an absolute date.
- `<short-kebab-slug>` — derived from the user story's "I want" line, ≤ 40 chars.
- If a file with the same date+slug exists, append `-2`, `-3`, … to disambiguate.

**File contents:**

```markdown
# Iteration: [Short title from "I want" line]

> Date:   [YYYY-MM-DD]
> Module: [module-name]
> Branch: [iter/<slug> — filled in after Step 2]
> Type:   [feat | fix | perf | refactor | ...]
> Status: planned

## User story

As a   [actor]
I want [capability]
So that [outcome]

## Acceptance criteria

- **Given** [precondition]
  **When**  [action]
  **Then**  [observable result]

## Out of scope

- [item]

## Notes

[free-form context]

## Spec-kit artifacts

- spec:  .specify/specs/{NNN-slug}/spec.md
- plan:  .specify/specs/{NNN-slug}/plan.md
- tasks: .specify/specs/{NNN-slug}/tasks.md

## Commit

- SHA:     [filled in after Step 8]
- Message: [Conventional Commits subject — filled in after Step 7]
```

This file is the **historical record of every change** to the module. Future
maintainers read `docs/iterations/` chronologically to understand how the module
evolved beyond its initial spec/DBML/BPMN snapshots.

---

### Step 4 — Drive spec-kit to produce the execution plan

Invoke spec-kit slash commands **in order**. After each one, read the produced
artifact and confirm with the user before advancing. Do NOT chain them silently
— each command's output is a checkpoint.

```
1. /speckit.specify   "<user story from Step 1>"
   → produces .specify/specs/{NNN-slug}/spec.md
2. /speckit.clarify
   → resolves ambiguities; pauses for user answers if needed
3. /speckit.plan
   → produces .specify/specs/{NNN-slug}/plan.md (architecture + file list)
4. /speckit.tasks
   → produces .specify/specs/{NNN-slug}/tasks.md (ordered task breakdown)
5. /speckit.analyze
   → cross-artifact consistency check; must pass before implementation
```

If `/speckit.analyze` returns issues, stop and surface them to the user — do not
proceed to implementation with known inconsistencies.

---

### Step 5 — Map the plan to Opscale skills

Read `tasks.md` and infer which Opscale skills are required. Use this mapping:

| Task touches | Skill to invoke |
|--------------|-----------------|
| New/changed business rules, actors, artifacts | `opscale-process` (updates `spec.md`) |
| New/changed entities, columns, enums, relationships | `opscale-dbml` then `opscale-domain` |
| New/changed process flow, task types | `opscale-bpmn` |
| New/changed Eloquent models, migrations, VOs, repos | `opscale-domain` |
| New/changed Nova resources, repeatables, field traits | `opscale-ui` |
| New/changed Opscale Action classes | `opscale-logic` |
| Any code change | `opscale-test` (generates / updates tests for the affected files only — not the whole suite) |

**Iteration ≠ full sequence.** Only invoke the skills that the diff actually
requires. If a task only edits a single Action, run `opscale-logic` for that one
Action and `opscale-test` to generate the matching Feature test — do not re-run
`opscale-domain` or `opscale-ui`.

Present the planned skill invocations to the user as a checklist BEFORE running
them:

```
Iteration plan:
  [ ] opscale-dbml      → add `priority` column to customers
  [ ] opscale-domain    → regenerate Customer model + migration
  [ ] opscale-ui        → update Customer Nova resource
  [ ] opscale-test      → regenerate Customer model unit test + resource browser test
Commit:
  feat(customers): add priority field to Customer

Proceed?
```

Wait for confirmation.

---

### Step 6 — Run `/speckit.implement`

After Opscale skills have generated/updated code, invoke:

```
/speckit.implement
```

This is spec-kit's verification pass — it cross-checks that every task in
`tasks.md` has a corresponding artifact in the working tree. If something is
missing, address it before commit.

---

### Step 7 — Validate the iteration

Run the local quality gates appropriate to the project type. Do NOT commit on
red.

```bash
composer run check     # fix + refactor + lint + analyse + test (Unit + Feature)
composer run test:web  # Browser smoke tests (only if Nova layer changed)
```

If any step fails:
1. Surface the failure to the user
2. Offer to fix automatically (run `composer run fix`, regenerate failing tests)
   or hand back for manual intervention
3. **Never bypass with `--no-verify` or skip steps unless the user explicitly
   asks for it**

---

### Step 8 — Compose the Conventional Commits message

Build the message from the change type, scope, and brief collected in Step 1.
Format must follow [Conventional Commits 1.0](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body — what changed and why, derived from spec.md "Why" section>

[optional footer(s)]
```

**Rules:**

- `<type>` — from the table in Step 1 (`feat`, `fix`, `perf`, `refactor`, etc.)
- `<scope>` — the module/aggregate touched, kebab-case (e.g. `customers`,
  `loans`, `kyc`). Single scope only. Omit `<scope>` entirely if the change
  spans the project root (config, tooling, multi-module refactor).
- `<subject>` — imperative mood, lowercase first letter, no trailing period,
  ≤ 72 chars. "add priority field to Customer", not "Added priority field."
- **Body** — wrap at 100 chars. Reference the spec folder (e.g. `Refs
  .specify/specs/014-customer-priority/spec.md`).
- **BREAKING CHANGE footer** — only if the user flagged the change as breaking
  in Step 1:
  ```
  BREAKING CHANGE: <description of the break and required migration>
  ```
  This is what causes semantic-release to issue a major version bump.
- Trailers — keep the standard Claude Code attribution:
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

**Examples:**

```
feat(customers): add priority field to Customer

Adds a `priority` enum column (low|normal|high) to the customers aggregate so
support agents can triage incoming tickets. Spec: actor "Support Lead",
trigger "ticket assignment". Default value `normal` to preserve existing
records.

Refs .specify/specs/014-customer-priority/spec.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

```
fix(loans): correct interest accrual rounding on grace period

Loans entering grace period were rounding accrued interest with bankers'
rounding instead of half-up, producing a 1-cent discrepancy in the published
statement. Aligns calculation with finance team's reference spreadsheet.

Refs .specify/specs/021-loan-grace-rounding/spec.md
Fixes #4827

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

```
feat(api)!: replace v1 token endpoint with /oauth/token

BREAKING CHANGE: clients calling POST /api/v1/token must migrate to
POST /oauth/token. The legacy endpoint returned a flat string token; the new
endpoint returns the OAuth 2.0 access_token response envelope. Migration
guide in docs/migrations/oauth-v2.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Validate the message against commitlint** before committing (if a
`commitlint.config.js` exists from `opscale-release`):

```bash
echo "<message>" | npx commitlint
```

If it fails, fix the message — do not commit a non-conforming message.

---

### Step 9 — Stage and commit (and backfill the iteration log)

Before committing, **backfill the iteration file** created in Step 3 with the
final commit message and status:

```markdown
> Status: shipped
...
## Commit

- SHA:     <will be filled after commit>
- Message: <type>(<scope>): <subject>
```

The iteration file is part of the commit (it lives under
`.specify/specs/<NNN-slug>/docs/iterations/`). Stage it alongside the source
changes.

Stage only files that the iteration actually produced or modified. Never
`git add -A` blindly — secrets, unrelated edits, or local debug artifacts can
slip in.

```bash
git status                             # review
git add <explicit list of files>       # stage intentionally
git commit -m "$(cat <<'EOF'
<full message from Step 7>
EOF
)"
git status                             # verify clean tree
```

If a pre-commit hook (Husky, lint-staged) fails:
1. Read the failure
2. Apply the fix (usually `composer run fix` or `npm run lint -- --fix`)
3. Re-stage and create a **new** commit. Never `--amend` after a hook failure —
   the original commit did not happen, and `--amend` would rewrite the previous
   one.

After the commit succeeds, write the resulting short SHA back into the iteration
file's `## Commit` section so the historical record is self-contained.

---

### Step 10 — Report

Output a concise summary:

```
Iteration complete.

Branch:   iter/<slug>
Spec:     .specify/specs/<NNN-slug>/
Commit:   <short SHA> <type>(<scope>): <subject>
Release:  semantic-release will publish a <patch|minor|major|no> release on merge to main

Next: push the branch and open a pull request.
  git push -u origin iter/<slug>
```

Do NOT push or open the PR automatically — leave that to the user.

---

## Domain Rules

1. **User story is the input format — non-negotiable.** Every iteration must
   be expressible as `As <actor> / I want <capability> / So that <outcome>`
   with at least one Given/When/Then acceptance criterion. If the user supplies
   a casual sentence, restructure it into the template and confirm before
   moving on.
2. **Every iteration is archived to `docs/iterations/YYYY-MM-DD-<slug>.md`** in
   the target module's spec folder. The filename always starts with the
   absolute date in `YYYY-MM-DD` format (never relative — resolve "today" to a
   concrete date). This file is part of the commit.
3. **One iteration = one commit** — every invocation of this skill produces
   exactly one commit. If the change is too large for one logical commit,
   surface that to the user and either split into multiple iterations or stop.
4. **Spec-kit is the source of truth for the plan** — never skip
   `/speckit.specify` / `/speckit.plan` / `/speckit.tasks` / `/speckit.analyze`.
   These are non-negotiable checkpoints; user confirms each artifact.
5. **Only invoke Opscale skills the diff requires** — iteration is surgical.
   Running the full pipeline on a one-column change is wasteful and creates
   spurious diffs that will fail review.
6. **Clean tree at start, clean tree at end** — refuse to start with uncommitted
   changes; refuse to finish with unstaged artifacts.
7. **Conventional Commits is mandatory** — the commit message is what
   semantic-release reads. A wrong prefix silently breaks the release. Validate
   with commitlint when available.
8. **Quality gates are blocking** — `composer run check` (and `test:web` when
   Nova changed) must pass before commit. No `--no-verify`, no skipping tests.
9. **BREAKING CHANGE is opt-in and explicit** — never infer it from the diff.
   Only add the footer when the user explicitly confirmed it in Step 1.
10. **Scope is single and from the constitution's module list** — multi-scope
    commits are a smell. If a change really spans modules, omit the scope
    entirely; do not invent compound scopes like `customers,loans`.
11. **Never push, never open PR automatically** — the skill stops at the local
    commit. The user owns the push and the PR.
12. **Existing artifact behavior is preserved** — when generators detect existing
    files, they merge or flag conflicts (see `resource-generator`,
    `action-generator`). Iteration never silently overwrites prior work.

---

## Output

After completing this skill, the project contains:

- ✅ A user story captured in the target module's
  `.specify/specs/{NNN-module}/docs/iterations/YYYY-MM-DD-<slug>.md`
  with story, acceptance criteria, spec-kit artifact pointers, and the
  resulting commit SHA
- ✅ A new spec-kit spec folder `.specify/specs/{NNN-iter-slug}/` with
  `spec.md`, `plan.md`, `tasks.md` for the iteration
- ✅ Generated/updated source files for the affected layers only
- ✅ Updated tests for the affected files (Unit / Feature / Browser as
  applicable)
- ✅ All quality gates green (`composer run check`)
- ✅ Exactly one commit on the iteration branch with a Conventional Commits
  message compatible with semantic-release
- ✅ Branch ready for the user to push and open a PR
