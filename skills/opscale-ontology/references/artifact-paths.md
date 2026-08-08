# Artifact paths — canonical reference

Single source of truth for where the Plan-phase skills write their outputs. Every skill that reads or writes these files MUST follow this convention.

The Plan phase is **stack-agnostic and exportable**: its artifacts are plain documents that live in the repo's `docs/plan/` folder, and `opscale-init` is never a prerequisite. With a writable project folder (Claude Code, or Claude Desktop opened on a repo/folder), each skill writes there directly. With no folder access, each skill produces exactly the same files as downloadable outputs — each labeled with its destination path — and the user drops them into the repo's `docs/plan/` afterwards. Either way, `docs/plan/` is the single source the rest of the pipeline reads.

## The two-output rule

Each Plan skill produces **exactly two outputs named after the skill** (without the `opscale-` prefix):

1. **The diagram** — its single source of truth, **self-contained**: all the metadata a consumer needs to interpret it travels inside the diagram itself (DBML Notes, BPMN `<documentation>` JSON, Mermaid `%%` lines). No diagram depends on another file to be understood.
2. **The `.txt`** — the skill's *relative ontology*: the slice of the module hierarchy that skill owns, as a plain indented outline. Markdown-free so gates can diff adjacent lists cheaply: `process.txt` steps ↔ `bpmn.txt` operations ↔ `sipoc.txt` compositions.

Anything else a skill needs to persist is **support for generation** and goes under `context/`. A skill that produces one file per piece uses a **folder named after the skill** with the piece id as filename (`sipoc/{kebab-id}.md`). The only exception is `opscale-map`, whose output is itself app-level context (`context/system.map.md`).

## The ontology id standard

Ids exist for exactly six ontology levels — nothing else carries an id:

| Level | Id | Assigned by | Lives in |
|---|---|---|---|
| Domain | `{domain-slug}` (kebab project slug, e.g. `finance`) | opscale-map | `context/system.map.md` domain headings |
| Subdomain (module) | `{domain-slug}/{module-slug}` (e.g. `finance/billing`) | opscale-map | `context/system.map.md` module rows; `%% module:` of `ontology.mmd` |
| Subprocess | `SP-XX` (sequential, two digits) | opscale-process | `process.txt` block headers; `bpmn.txt` sections; tree labels |
| Business step | `SP-XX-YY` (YY = local step number, restarts per subprocess) | opscale-process | `process.txt` local `YY)` numbering; tree labels |
| Entity | kebab-case of the final entity (= table name with dashes, e.g. `invoice-item`) | opscale-dbml (on the FINAL, reconciled entities) | `dbml.dbml` Table Note opening; `@entity` docblocks; `%% entity:` lines |
| Operation | standalone: `SP-XX-YY-[C\|L]ZZ` (C crud, L logic); composed inside a Logic (CRUDs **and Outputs**): `SP-XX-YY-LZZ-[C\|L\|O]AA`. Outputs are never standalone | opscale-bpmn | `"oid"` keys of the `bpmn.bpmn` documentation JSON; `bpmn.txt` op lines; tree labels |

Logic operations additionally keep their kebab `logic.id` (the future Action's slug); `BR-NN` is the business-rule registry (defined in the SIPOCs), not an ontology level. `names.md` carries **no ids** — it is input for the dbml reconciliation.

## Layout

One module per `docs/plan/`. Multi-module apps keep one `docs/plan/` per module repo; `context/` carries the shared app-level context.

```
docs/plan/
├── README.md              # manifest written by opscale-init: which skill produces
│                          #   which file, in which order
├── context/               # generation support: app-level views + module-wide registries
│   ├── system.map.md      # ALL domains → ALL subdomains (modules) → cross-module refs
│   │                      #   (opscale-map); header carries the software name + purpose
│   ├── names.md           # name normalization table: canonical ← aliases (no ids — input for dbml)
│   ├── business-types.md  # canonical language-agnostic business-type registry
│   └── external-refs.md   # virtual references to entities owned by other modules (opscale-dbml)
├── process.mmd            # opscale-process — Mermaid flowchart of the macro-flow
├── process.txt            # opscale-process — one block per subprocess
│                          #   (name, Trigger:, Ends with:, numbered steps)
├── dbml.dbml              # opscale-dbml — data model (renders as the ER diagram)
├── dbml.txt               # plain list: one entity per line
├── bpmn.bpmn              # opscale-bpmn — BPMN 2.0 XML, self-contained (embedded JSON metadata)
├── bpmn.txt               # per subprocess: business step → operations (+ composed CRUDs/Outputs)
├── sipoc/
│   └── {kebab-id}.md      # one SIPOC per Logic (opscale-sipoc); defines the module's BR-NN rules
├── sipoc.txt              # plain list: Logic → composing operations
├── ontology.mmd           # opscale-ontology — Mermaid treeView of the whole hierarchy (Plan closer)
└── ontology.txt           # the whole hierarchy as a plain indented outline
```

There is no `logs/` folder: every file above is canonical, exportable, and safe to consume downstream.

## Constants

| Skill            | Final artifacts (under `docs/plan/`)                        |
|------------------|-------------------------------------------------------------|
| opscale-map      | `context/system.map.md`                                     |
| opscale-process  | `process.mmd` + `process.txt` (+ `context/names.md`)        |
| opscale-dbml     | `dbml.dbml` + `dbml.txt` (+ `context/external-refs.md`)     |
| opscale-bpmn     | `bpmn.bpmn` + `bpmn.txt`                                    |
| opscale-sipoc    | `sipoc/{kebab-id}.md` (one per Logic) + `sipoc.txt`         |
| opscale-ontology | `ontology.mmd` + `ontology.txt`                             |

## Spec-kit boundary

`docs/plan/` holds the Plan-phase documents and nothing else. Spec-kit keeps its own files under `.specify/` (repo projects only):

- `.specify/memory/constitution.md` — project constitution (`opscale-init`).
- `.specify/memory/business-types.php` — stack-specific **implementation binding** of the business-type registry (slug → field, rules, cast, config). Consumed by the Generate phase only. Every slug must exist in both this file and `docs/plan/context/business-types.md`.
- `.specify/specs/*/plan.md` and `tasks.md` — written by the `/speckit.*` commands.

The Plan phase itself never requires `.specify/`: it can run in a repo before init or with no repo at all. In particular, `context/business-types.md` is seeded by the **first skill that needs it** (`opscale-dbml` or `opscale-sipoc` copy it from their bundled `references/business-types.md`); `opscale-init` only adopts or seeds it when bootstrapping the implementation track.

## Final-artifact format

- `context/system.map.md` — the system map: software name + purpose header, then **every** business line (domain, heading `### {Name} ({domain-slug})`) with **every** module (subdomain, Id column `{domain-slug}/{module-slug}`) — exhaustive, including not-yet-planned modules — plus the cross-module reference table. Written by `opscale-map`, consulted by `opscale-dbml` when resolving external refs and by `opscale-ontology` for the top hierarchy levels and their project ids.
- `context/names.md` — title line (`# Names — {Module}`) + the normalization table (`| Canónico | ← alias |`, ≥2 data rows, **no id column**). Input for the dbml reconciliation: the final entities (and their kebab ids) emerge there. Written by `opscale-process`.
- `context/business-types.md` — **canonical, language-agnostic registry** of business data types (slug → meaning, storage, validation semantics, UI intent). Copied from the skill bundle on first use, extensible per project. Consumed by `opscale-dbml` (the slug IS the column type) and `opscale-sipoc` (input/output typing). Plan artifacts reference slugs only.
- `context/external-refs.md` — fenced `external-refs` block (`slug: col_a, col_b`) listing the virtual entities this module references from other modules. Read by the Generate phase to wire cross-module references.
- `process.mmd` — **Mermaid `flowchart TD`** of the macro-flow: one `subgraph spXX` per subprocess (label `SP-XX {name}`), one node `sXX_YY` per local step (gateway shape `{}` on branching steps), `t0`/`wXX` event nodes for the module trigger and each closing wait. Self-contained `%% module:` metadata (entity ids do not exist yet at this stage).
- `process.txt` — the flow, plain text: one block per subprocess (blank line between blocks). Each block: `SP-XX {name}` header line, `Trigger:` line (opening event), `Ends with:` line (closing wait; `—` for the final subprocess), then its local `YY)` steps (two digits, numbering restarts per subprocess; step id = `SP-XX-YY`; branch destinations are local). No markdown, no emojis, no type markers.
- `dbml.dbml` — **raw DBML**, no markdown fence, no surrounding prose. Parseable by `@dbml/core` directly. Self-contained: every table Note opens with the entity's kebab id (`{kebab} — `, ≡ the table name with dashes); every column's type is a business-type slug or an Enum (`identifier` for id/FK/external-ref, `timestamp` only on the structural timestamps; never `varchar`/`text`/`decimal`) — validator-enforced.
- `dbml.txt` — one DBML entity name per line, declaration order, nothing else.
- `bpmn.bpmn` — **raw BPMN 2.0 XML**, no markdown wrapper. Loadable in Camunda Modeler. Self-contained: the `<bpmn:process>`-level `<bpmn:documentation>` carries `{"module","standard"}`; every task's `<bpmn:documentation>` carries one JSON object with its `oid` — CRUD (standalone): `{"type":"crud","oid","entity","action","step","subprocess"}`; Logic: `{"type":"logic","oid","id",…,"rules":[…],"composed":[{oid,entity,action}|{oid,content},…]}` — the `composed` array holds CRUD members and Output members `{oid,content}`. There are no `sendTask` nodes: Outputs live inside their Logic. A Logic id reused by several nodes carries identical JSON in each.
- `bpmn.txt` — per subprocess (`SP-XX {name}` first line, blank line between sections only): top-level operations are only standalone `- {oid} crud:` and `- {oid} logic:`; under each logic line, its composed members indented — CRUDs (`  - {oid}-CAA crud: `) **and Outputs** (`  - {oid}-OAA output: `). Outputs are never top-level. Absorbs both the atomic and the grouped sequence.
- `sipoc/{kebab-id}.md` — one SIPOC document per Logic (BPMN `businessRuleTask`), filename is the `logic.id` (kebab-case). Each file is the self-contained SIPOC diagram of its Logic. The set is the module's **canonical BR-NN registry**: every business rule is defined in exactly one SIPOC's `Business Rules enforced` section, with module-unique numbering.
- `sipoc.txt` — plain outline: `{Logic name} ({kebab-id})` line, its composing operations prefixed `- `, blank line between Logics. Matches each SIPOC's Process section.
- `ontology.mmd` — **Mermaid `treeView-beta`** rendering the whole hierarchy: Software → Domain → Module → Subprocess → Business Step → Operation, each Logic expanded into its composed CRUDs and Outputs — **every node label opens with its ontology id** (SP-XX / SP-XX-YY / oid). Self-contained metadata in `%%` lines: `%% module: xxx/yyy | domain: … | software: …`, one `%% entity: {kebab} | Business name | aliases | table | enums` per stamped table, one `%% external: ref:{slug} | columns` per external ref. Built by `opscale-ontology` exclusively from the other `docs/plan/` artifacts. **It is the Generate phase's build manifest**: `opscale-init`/`opscale-domain`/`opscale-logic`/`opscale-ui` read it as the summary of what to generate (the hierarchy + entity lineage) and drill into `dbml.dbml` / `bpmn.bpmn` / `sipoc/` for the per-node detail. No Plan skill reads it, and it is never hand-edited — a wrong node is fixed by re-running the owning Plan skill.
- `ontology.txt` — the same hierarchy as a plain indented outline (2-space indent per level), one node per line.

## What was removed

These legacy paths are no longer written or read by any skill:

- `domain.dbml` — renamed to `dbml.dbml` (output named after the skill)
- `logic.bpmn` (and earlier `process.bpmn`) — renamed to `bpmn.bpmn`
- `actions/{kebab-id}.md` (and earlier `actions/{kebab-id}.sipoc.md`) — renamed to `sipoc/{kebab-id}.md`
- `operations.md` — its content (business step per operation, Logic composition, governing rules) now travels **inside `bpmn.bpmn`** as embedded `<bpmn:documentation>` JSON
- `subprocesses/{kebab-name}.txt` — consolidated into the single `bpmn.txt`
- `ontology.html` — replaced by `ontology.mmd` (treeView) + `ontology.txt`; the lineage table it rendered now lives in `ontology.mmd`'s `%%` metadata
- `E-NN` entity ids (and the `ID` column of `names.md`) — replaced by the kebab-case entity id assigned by `opscale-dbml` on the final entities (table Note opening → `@entity` docblock)
- `naming.md` — the hand-maintained name-lineage table; replaced by the kebab-id chain (`{kebab} — ` table Note in `dbml.dbml` → `@entity` docblock on the generated class)
- `process.md` — the old structured spec; folded into `process.txt` + `context/names.md`
- `context/domain-map.md` — renamed to `context/system.map.md`
- `docs/plan/external-refs.md` — moved to `docs/plan/context/external-refs.md`
- `.specify/specs/{NNN}-{module}/final/` and `logs/` — replaced by the flat `docs/plan/` layout; phase logs eliminated
- `spec.md`, `docs/process.md`, `data-model.md`, `docs/initial.dbml`, `docs/initial.bpmn`, `docs/actions/` — earlier legacy paths, folded into the artifacts above
