# Artifact paths — canonical reference

Single source of truth for where the Plan-phase skills write their outputs. Every skill that reads or writes these files MUST follow this convention.

The Plan phase is **stack-agnostic and exportable**: its artifacts are plain documents that live in the repo's `docs/plan/` folder, and `opscale-init` is never a prerequisite. With a writable project folder (Claude Code, or Claude Desktop opened on a repo/folder), each skill writes there directly. With no folder access, each skill produces exactly the same files as downloadable outputs — each labeled with its destination path — and the user drops them into the repo's `docs/plan/` afterwards. Either way, `docs/plan/` is the single source the rest of the pipeline reads.

## Layout

One module per `docs/plan/`. Multi-module apps keep one `docs/plan/` per module repo; `context/` carries the shared app-level context.

```
docs/plan/
├── README.md              # manifest written by opscale-init: which skill produces
│                          #   which file, in which order
├── context/               # shared context: app-level views + module-wide registries
│   ├── system.map.md      # ALL domains → ALL subdomains (modules) → cross-module refs
│   │                      #   (opscale-map); header carries the software name + purpose
│   ├── names.md           # name normalization table: canonical ← aliases (opscale-process)
│   ├── business-types.md  # canonical language-agnostic business-type registry
│   └── external-refs.md   # virtual references to entities owned by other modules (opscale-dbml)
├── process.txt            # opscale-process — the flow: one block per subprocess
│                          #   (name, Trigger:, Ends with:, numbered steps)
├── domain.dbml            # opscale-dbml — data model (renders as the ER diagram)
├── dbml.txt               # plain list: one entity per line
├── naming.md              # name lineage: business name → table → enums
├── logic.bpmn             # opscale-bpmn — BPMN 2.0 XML
├── operations.md          # atomic + grouped sequences, composition per Logic
├── subprocesses/
│   └── {kebab-name}.txt   # one per subprocess: its business steps → operations (opscale-bpmn)
├── sipoc.txt              # plain list: Logic → composing operations
├── ontology.html          # opscale-ontology — self-contained interactive hierarchy
│                          #   view (Plan closer)
└── actions/
    └── {kebab-id}.md      # one SIPOC per Logic (opscale-sipoc); defines the module's BR-NN rules
```

There is no `logs/` folder: every file above is canonical, exportable, and safe to consume downstream.

The `.txt` artifacts are deliberately markdown-free so gates can diff adjacent lists (subprocess steps ↔ operations ↔ compositions) to detect drift between artifacts cheaply: `process.txt` blocks ↔ `subprocesses/*.txt` files ↔ `sipoc.txt` blocks.

## Constants

| Skill            | Final artifacts (under `docs/plan/`)                                  |
|------------------|-----------------------------------------------------------------------|
| opscale-map      | `context/system.map.md`                                               |
| opscale-process  | `context/names.md` + `process.txt`                                    |
| opscale-dbml     | `domain.dbml` + `dbml.txt` + `naming.md` + `context/external-refs.md` |
| opscale-bpmn     | `logic.bpmn` + `operations.md` + `subprocesses/{kebab-name}.txt`      |
| opscale-sipoc    | `actions/{kebab-id}.md` (one per Logic) + `sipoc.txt`                 |
| opscale-ontology | `ontology.html`                                                       |

## Spec-kit boundary

`docs/plan/` holds the Plan-phase documents and nothing else. Spec-kit keeps its own files under `.specify/` (repo projects only):

- `.specify/memory/constitution.md` — project constitution (`opscale-init`).
- `.specify/memory/business-types.php` — stack-specific **implementation binding** of the business-type registry (slug → field, rules, cast, config). Consumed by the Generate phase only. Every slug must exist in both this file and `docs/plan/context/business-types.md`.
- `.specify/specs/*/plan.md` and `tasks.md` — written by the `/speckit.*` commands.

The Plan phase itself never requires `.specify/`: it can run in a repo before init or with no repo at all.

## Final-artifact format

- `context/system.map.md` — the system map: software name + purpose header, then **every** business line (domain) with **every** module (subdomain) — exhaustive, including not-yet-planned modules — plus the cross-module reference table. Written by `opscale-map`, consulted by `opscale-dbml` when resolving external refs and by `opscale-ontology` for the top hierarchy levels.
- `context/names.md` — title line (`# Names — {Module}`) + the normalization table (`| Canónico | ← alias |`, ≥2 data rows). Written by `opscale-process`; what `opscale-dbml` reads to lock entity names.
- `context/business-types.md` — **canonical, language-agnostic registry** of business data types (slug → meaning, storage, validation semantics, UI intent). Copied from the skill bundle on first use, extensible per project. Consumed by the Plan phase: `opscale-dbml` (attribute typing, `// type:{slug}` notes on every column) and `opscale-sipoc` (input typing). Plan artifacts reference slugs only.
- `context/external-refs.md` — fenced `external-refs` block (`slug: col_a, col_b`) listing the virtual entities this module references from other modules. Read by the Generate phase to wire cross-module references.
- `process.txt` — the flow, plain text: one block per subprocess (blank line between blocks). Each block: subprocess name line, `Trigger:` line (opening event), `Ends with:` line (closing wait; `—` for the final subprocess), then its `N)` numbered steps (numbering sequential across the whole module). No markdown, no emojis, no type markers.
- `domain.dbml` — **raw DBML**, no markdown fence, no surrounding prose. Parseable by `@dbml/core` directly. Every column carries a business type (`// type:{slug}`), an Enum type, or an `// external_ref:{slug}` note — validator-enforced.
- `dbml.txt` — one DBML entity name per line, declaration order, nothing else.
- `naming.md` — name-lineage table: canonical business name (from `context/names.md`) → DBML table → enums. Extended by the Generate phase with the generated class names. This is the artifact that lets management, users, and developers trace one concept across all layers.
- `logic.bpmn` — **raw BPMN 2.0 XML**, no markdown wrapper. Loadable in Camunda Modeler.
- `operations.md` — canonical operation record per subprocess: atomic sequence grouped by **business step** (every CRUD / Output / Event / Gateway labeled with the business step it decomposes), grouped sequence (Logics replacing absorbed CRUDs), and composition detail per Logic (`id`, business step, governing rule in prose, `composed of` CRUD list). This is where the business→technical decomposition (business step → 1..N operations) lives. Read by `opscale-sipoc`.
- `subprocesses/{kebab-name}.txt` — one plain outline per subprocess (filename = subprocess name in kebab-case; one file per `process.txt` block, same count/order/names): business step name line, its operations prefixed `- {category}: `, blank line between steps.
- `actions/{kebab-id}.md` — one SIPOC document per Logic (BPMN `businessRuleTask`), filename is the `logic.id` (kebab-case). The set of SIPOCs is the module's **canonical BR-NN registry**: every business rule is defined in exactly one SIPOC's `Business Rules enforced` section, with module-unique numbering.
- `sipoc.txt` — plain outline: `{Logic name} ({kebab-id})` line, its composing operations prefixed `- `, blank line between Logics. Matches each SIPOC's Process section.
- `ontology.html` — **self-contained interactive HTML** (inline CSS+JS, zero external requests) rendering the module ontology: Software → Domain → Module → Subprocess → Business Step → Operation, each Logic expanded into its composed CRUDs with rule badges. Built by `opscale-ontology` exclusively from the other `docs/plan/` artifacts. A view, never a source — no skill reads it.

## What was removed

These legacy paths are no longer written or read by any skill:

- `process.md`, `process.mmd` — the structured spec and its Mermaid view; folded into `process.txt` (flow) + `context/names.md` (normalization)
- `bpmn.txt` — replaced by the per-subprocess `subprocesses/{kebab-name}.txt` outlines
- `process.bpmn` — renamed to `logic.bpmn`
- `context/domain-map.md` — renamed to `context/system.map.md`
- `docs/plan/external-refs.md` — moved to `docs/plan/context/external-refs.md`
- `.specify/specs/{NNN}-{module}/final/` — replaced by the flat `docs/plan/` layout above
- `.specify/specs/{NNN}-{module}/logs/` — phase logs eliminated; Plan skills no longer keep Q/A records
- `actions/{kebab-id}.sipoc.md` — renamed to `actions/{kebab-id}.md`
- `spec.md`, `docs/process.md`, `data-model.md`, `docs/initial.dbml`, `docs/initial.bpmn`, `docs/actions/` — earlier legacy paths, folded into the artifacts above
