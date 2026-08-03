# Sample output — opscale-init

Anonymized excerpt derived from a working Opscale module
(`Unicoop/membresia`). Shows the SHAPE of what the skill produces,
not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body. The full original file lives in the source module.

---

## 1. `.specify/memory/constitution.md` (top 30 lines)

```markdown
# Opscale Project Constitution

**Project:** Loans
**Project Type:** module
**Module Prefix:** loans
**Locale:** en
**Created:** 2026-06-28

> This constitution is the architectural DNA of every Opscale project.
> Claude Code MUST read and comply with it before generating any code,
> spec, plan, or task. Derived from
> [opscale-co/strict-rules](https://github.com/opscale-co/strict-rules)
> and supersedes all other instructions.

---

## 0. Project Type

**Type: module** — locked at `opscale-init` time. The skill prompts for
one of `app` / `module` / `package` / `library` and substitutes the
value into this constitution. The choice is permanent for the project.

| Type    | Description                                                   |
|---------|---------------------------------------------------------------|
| app     | Complete Nova application containing multiple modules         |
| module  | Single bounded-context package within an app                  |
| package | Standalone reusable project published to Packagist            |
| library | Pure utility / infrastructure, no domain / Nova / Actions     |

## I. Design Methodology — sequence constraints

Follow the skill sequence strictly. Each skill declares its own
prerequisites and outputs in its `SKILL.md`. ...
```

## 2. `.specify/` scaffold tree (after init)

```
.specify/
├── extensions/
│   └── git/
├── extensions.yml
├── init-options.json          # { "ai": "claude", "ai_skills": true, ... }
├── integration.json
├── integrations/
├── memory/
│   └── constitution.md        # locked: project, type, prefix, locale
├── scripts/
├── specs/                     # one folder per feature: 001-<slug>/…
├── templates/
│   ├── checklist-template.md
│   ├── constitution-template.md
│   ├── plan-template.md
│   ├── spec-template.md
│   └── tasks-template.md
└── workflows/
```

## 3. Companion files seeded next to `.specify/`

```
docs/plan/                     # Plan intake folder (flat, exportable — see references/artifact-paths.md)
├── README.md                  # manifest: which skill produces which file, in order
└── context/
    └── business-types.md      # canonical business-type registry (Plan side)
.claude/skills/                # speckit-* skills (constitution, plan, tasks, …)
CLAUDE.md                      # context for Claude Code, points at constitution
commitlint.config.mjs          # Conventional Commits — enforced by lint-staged
duster.json
pint.json
rector.php
phpstan.neon
.husky/
```
