# Artifact paths — canonical reference

Single source of truth for where the Plan-phase skills write their phase logs and final outputs. Every skill that reads or writes these files MUST follow this convention.

## Layout

Every module's spec directory has the same shape:

```
.specify/specs/{NNN}-{module-name}/
├── logs/              # phase-by-phase Q/A records (one file per skill run)
│   ├── process.md
│   ├── dbml.md
│   ├── bpmn.md
│   └── sipoc.md
└── final/             # canonical, machine-consumable artifacts
    ├── process.md
    ├── domain.dbml
    ├── external-refs.md
    ├── naming.md
    ├── process.bpmn
    ├── operations.md
    └── actions/
        └── {kebab-id}.sipoc.md
```

App-level (shared across modules):

```
.specify/memory/domain-map.md         # domains → subdomains (modules) → cross-module refs (opscale-map)
.specify/memory/business-types.md     # canonical language-agnostic business-type registry (opscale-init; Plan reads this)
.specify/memory/business-types.php    # Laravel/Nova implementation binding of the registry (opscale-init; Generate reads this)
```

## Constants

| Skill            | Phase log              | Final artifact                                 |
|------------------|------------------------|------------------------------------------------|
| opscale-map      | —                      | `.specify/memory/domain-map.md` (app-level)    |
| opscale-process  | `logs/process.md`      | `final/process.md`                             |
| opscale-dbml     | `logs/dbml.md`         | `final/domain.dbml` + `final/external-refs.md` + `final/naming.md` |
| opscale-bpmn     | `logs/bpmn.md`         | `final/process.bpmn` + `final/operations.md`   |
| opscale-sipoc    | `logs/sipoc.md`        | `final/actions/{kebab-id}.sipoc.md` (one per businessRuleTask) |

All paths are relative to `.specify/specs/{NNN}-{module-name}/`.

## Phase-log format (shared)

Each `logs/<skill>.md` follows the same shape so downstream auditors can parse it uniformly:

```markdown
# <Skill name> — Phase Log
Module: {NNN}-{module-name}
Generated: {ISO-8601 timestamp}

## Phase N — <Phase title>
**Question:** <prompt as posed to the user>
**Answer:** <user's response, verbatim>
**Decision:** <one-line resolution recorded into the final artifact>

## Phase N+1 — ...
```

The log is replaced on each re-run (not append-across-runs). Within a single run, phases are appended in order.

## Final-artifact format

- `final/process.md` — structured spec (sections: `Name normalization`, `Lifecycle`, `Ordered flow`, `Relations`, `Narrative`). Markdown.
- `final/domain.dbml` — **raw DBML**, no markdown fence, no surrounding prose. Parseable by `@dbml/core` directly.
- `final/external-refs.md` — fenced `external-refs` block (`slug: col_a, col_b`) listing the virtual models this module references from other modules. Read by `opscale-domain` to generate contract interfaces.
- `final/naming.md` — name-lineage table: canonical business name (from `process.md` Name normalization) → DBML table → enums. Extended by `opscale-domain` with the generated model class. This is the artifact that lets management, users, and developers trace one concept across all layers.
- `final/process.bpmn` — **raw BPMN 2.0 XML**, no markdown wrapper. Loadable in Camunda Modeler.
- `final/operations.md` — canonical operation record per subprocess: atomic sequence grouped by **business step** (every CRUD / Output / Event / Gateway labeled with the business step it decomposes), grouped sequence (Logics replacing absorbed CRUDs), and composition detail per Logic (`id`, business step, governing rules, `composed of` CRUD list). This is where the business→technical decomposition (business step → 1..N operations) lives. Read by `opscale-sipoc` — never read `logs/bpmn.md` for this.
- `final/actions/{kebab-id}.sipoc.md` — one SIPOC document per BPMN `businessRuleTask`, filename is the BPMN `logic.id` (kebab-case).
- `.specify/memory/domain-map.md` — app-level domain map: business lines (domains) → their modules (subdomains) → cross-module external refs. Written by `opscale-map`, consulted by `opscale-dbml` when resolving external refs.
- `.specify/memory/business-types.md` — **canonical, language-agnostic registry** of business data types (slug → meaning, storage, validation semantics, UI intent). Copied from the skill bundle by `opscale-init`, extensible per project. Consumed by the Plan phase: `opscale-dbml` (attribute typing, `// type:{slug}` notes) and `opscale-sipoc` (input typing). Plan artifacts reference slugs only.
- `.specify/memory/business-types.php` — Laravel/Nova **implementation binding** of the registry (slug → field class, rule strings, cast, config). Consumed by Generate only: `opscale-domain` (casts + `$validationRules`), `opscale-ui` (field selection), `opscale-logic` (`parameters()` rules). Every slug must exist in both files.

## What was removed

These legacy paths are no longer written or read by any skill:

- `spec.md`, `docs/process.md` (folded into `final/process.md`)
- `data-model.md`, `docs/initial.dbml` (replaced by `final/domain.dbml` + `logs/dbml.md`)
- `process.md` at the spec root in BPMN context, `docs/initial.bpmn` (replaced by `final/process.bpmn` + `logs/bpmn.md`)
- `docs/actions/` (moved to `final/actions/`)
