# Artifact paths — canonical reference

Single source of truth for where the Plan-phase skills write their outputs. Every skill that reads or writes these files MUST follow this convention. This file lives in the **shared Plan contract** (`shared/plan-contract/`) alongside the JSON Schemas, the renderers (`lib/`), and the bundled `node_modules`; the per-skill validators/renderers resolve the contract from here (or from a vendored copy at the bundle root — see `README.md`).

The Plan phase is **stack-agnostic and exportable**: its artifacts are plain files that live in the repo's `docs/plan/` folder, and `opscale-init` is never a prerequisite. With a writable project folder (Claude Code, or Claude Desktop opened on a repo/folder), each skill writes there directly. With no folder access, each skill produces exactly the same files as downloadable outputs — each labeled with its destination path — and the user drops them into the repo's `docs/plan/` afterwards. Either way, `docs/plan/` is the single source the rest of the pipeline reads.

## The source-of-truth + projection rule

Each Plan skill produces **a schema-validated JSON source of truth plus a deterministic projection**, both named after the skill (without the `opscale-` prefix):

1. **The JSON** (`<skill>.json`) — the single source of truth, validated against its JSON Schema in `shared/plan-contract/schema/`. Skills only ever author this file; it is never hand-edited after validation fails.
2. **The projection** — rendered **deterministically** from the JSON by the shared contract's renderer (`lib/render/<skill>.mjs`), never authored by hand. It is the self-contained human/tool view: all the metadata a consumer needs travels inside it (DBML Notes, BPMN `<documentation>` JSON, Mermaid `%%` lines). No projection depends on another file to be understood.

| Skill | JSON source of truth | Deterministic projection |
|---|---|---|
| opscale-process | `process.json` | `process.mmd` (Mermaid flowchart) |
| opscale-dbml | `dbml.json` | `dbml.dbml` (ER diagram, raw DBML) |
| opscale-bpmn | `bpmn.json` | `bpmn.bpmn` (BPMN 2.0 XML) |
| opscale-sipoc | `sipoc.json` | `sipoc/{kebab-id}.md` (one file per Logic) |
| opscale-graph | `graph.json` | `graph.html` (interactive, self-contained card tree) |

Anything else a skill needs to persist is **support for generation** and goes under `context/`. The only exception is `opscale-map`, whose output is itself app-level context (`context/system.map.md`).

## The ontology id standard

Ids exist for exactly six ontology levels — nothing else carries an id:

| Level | Id | Assigned by | Lives in |
|---|---|---|---|
| Domain | `{domain-slug}` (kebab project slug, e.g. `finance`) | opscale-map | `context/system.map.md` domain headings |
| Subdomain (module) | `{domain-slug}/{module-slug}` (e.g. `finance/billing`) | opscale-map | `context/system.map.md` module rows; `process.json` `module` block (the SINGLE source), shown in `graph.html`'s header (derived from `process.json`) |
| Subprocess | `SP-XX` (sequential, two digits) | opscale-process | `process.json` subprocess blocks; `bpmn.json` sections; tree labels |
| Business step | `SP-XX-YY` (YY = local step number, restarts per subprocess) | opscale-process | `process.json` steps (≤25-char title + description); tree labels |
| Entity | kebab-case of the final entity (= table name with dashes, e.g. `invoice-item`) | opscale-dbml (on the FINAL, reconciled entities) | `dbml.json` entity `code`; rendered `dbml.dbml` Table Note opening; `@entity` docblocks; `graph.json` entity lineage |
| Operation | standalone: `SP-XX-YY-[C\|L]ZZ` (C crud, L logic); composed inside a Logic (CRUDs **and Outputs**): `SP-XX-YY-LZZ-[C\|L\|O]AA`. Outputs are never standalone | opscale-bpmn | `bpmn.json` operation `code` (nested under its subprocess/step keys); rendered `bpmn.bpmn` documentation JSON; tree labels |

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
├── process.json           # opscale-process — SoT: subprocesses, steps (title+description), events
├── process.mmd            # rendered Mermaid flowchart of the macro-flow
├── dbml.json              # opscale-dbml — SoT: prefix, standards, enums, entities,
│                          #   per-entity permissions, relationships (no audit fields)
├── dbml.dbml              # rendered data model (the ER diagram), parseable by @dbml/core
├── bpmn.json              # opscale-bpmn — SoT: operations per subprocess (composed members nested)
├── bpmn.bpmn              # rendered BPMN 2.0 XML, self-contained (embedded JSON metadata),
│                          #   one expandable subProcess container per subprocess
├── sipoc.json             # opscale-sipoc — SoT: one SIPOC per first-level logic operation
├── sipoc/
│   └── {kebab-id}.md      # rendered SIPOC per Logic; the set defines the module's BR-NN registry
├── graph.json             # opscale-graph — SoT: traceability graph (nested {id, ref} hierarchy), Plan closer
└── graph.html             # rendered interactive, self-contained card tree of the whole hierarchy
```

There is no `logs/` folder: every file above is canonical, exportable, and safe to consume downstream.

## Constants

| Skill            | Final artifacts (under `docs/plan/`)                            |
|------------------|-----------------------------------------------------------------|
| opscale-map      | `context/system.map.md`                                         |
| opscale-process  | `process.json` + `process.mmd` (+ `context/names.md`)           |
| opscale-dbml     | `dbml.json` + `dbml.dbml` (+ `context/external-refs.md`)        |
| opscale-bpmn     | `bpmn.json` + `bpmn.bpmn`                                       |
| opscale-sipoc    | `sipoc.json` + `sipoc/{kebab-id}.md` (one per Logic)            |
| opscale-graph    | `graph.json` + `graph.html`                                     |

## Spec-kit boundary

`docs/plan/` holds the Plan-phase files and nothing else. Spec-kit keeps its own files under `.specify/` (repo projects only):

- `.specify/memory/constitution.md` — project constitution (`opscale-init`).
- `.specify/memory/business-types.php` — stack-specific **implementation binding** of the business-type registry (slug → field, rules, cast, config). Consumed by the Generate phase only. Every slug must exist in both this file and `docs/plan/context/business-types.md`.
- `.specify/specs/*/plan.md` and `tasks.md` — written by the `/speckit.*` commands.

The Plan phase itself never requires `.specify/`: it can run in a repo before init or with no repo at all. In particular, `context/business-types.md` is seeded by the **first skill that needs it** (`opscale-dbml` or `opscale-sipoc` copy it from the shared contract's `business-types.md`); `opscale-init` only adopts or seeds it when bootstrapping the implementation track.

## Final-artifact format

- `context/system.map.md` — the system map: software name + purpose header, then **every** business line (domain, heading `### {Name} ({domain-slug})`) with **every** module (subdomain, Id column `{domain-slug}/{module-slug}`) — exhaustive, including not-yet-planned modules — plus the cross-module reference table. Written by `opscale-map`, consulted by `opscale-dbml` when resolving external refs and by `opscale-graph` for the top hierarchy levels and their project ids.
- `context/names.md` — title line (`# Names — {Module}`) + the normalization table (`| Canónico | ← alias |`, ≥2 data rows, **no id column**). Input for the dbml reconciliation: the final entities (and their kebab ids) emerge there. Written by `opscale-process`.
- `context/business-types.md` — **canonical, language-agnostic registry** of business data types (slug → meaning, storage, validation semantics, UI intent). Copied from the shared contract on first use, extensible per project. Consumed by `opscale-dbml` (the slug IS the column type) and `opscale-sipoc` (input/output typing). Plan artifacts reference slugs only.
- `context/external-refs.md` — fenced `external-refs` block (`slug: col_a, col_b`) listing the virtual entities this module references from other modules. Read by the Generate phase to wire cross-module references.
- `process.json` — the SoT flow: a top-level `module` block (`software`/`domain`/`subdomain`) that is the **SINGLE source of `module`** for the whole plan — dbml/bpmn/sipoc/graph carry none and derive it from here; then one block per subprocess, each with a name, `trigger` (opening event), `ends_with` (closing wait; `—` for the final subprocess), and ordered steps (local `SP-XX-YY` ids; each step has a ≤25-char title and a description). ≤5 subprocesses, each with 2–5 steps. Business-level only — no type markers, no operations.
- `process.mmd` — rendered **Mermaid `flowchart TD`** of the macro-flow: one `subgraph spXX` per subprocess (label `SP-XX {name}`), one node `sXX_YY` per local step (gateway shape `{}` on branching steps), `t0`/`wXX` event nodes for the module trigger and each closing wait. Self-contained `%% module:` metadata.
- `dbml.json` — the SoT data model: the module `prefix` (`MODULE_PREFIX`), the `standards` block (chosen modeling standard — the analysis conclusion; name-normalization notes stay in `names.md`), the entities (each with its kebab `code`, columns typed by business-type slug or Enum with an optional `calculated` flag on derived fields, and per-entity `permissions` predicates), and the mandatory `relationships`. Carries **no audit fields** — those are added by the Generate phase. Carries **no `module` block** — the subdomain for the rendered Project Note is derived from the sibling `process.json`. Every type is a business-type slug or an Enum (`identifier` for id/FK/external-ref, `timestamp` only on structural timestamps; never `varchar`/`text`/`decimal`) — validator-enforced.
- `dbml.dbml` — rendered **raw DBML**, no markdown fence, no surrounding prose. Parseable by `@dbml/core` directly. Self-contained: every table Note opens with the entity's kebab id (`{kebab} — `, ≡ the table name with dashes).
- `bpmn.json` — the SoT flow at operation level: `operations` is a **nested map** keyed by subprocess code → step code → ordered operation array (both keys reference `process.json`; subprocesses/steps are not reproduced). CRUD (standalone): `{"type":"crud","code","position","entity","action"}`; Logic: `{"type":"logic","code","position","id","rules":[…],"operations":[{code,entity,action}|{code,content}|{code,ref},…]}`. `position` restarts at 1 within each step array and equals the 1-based index. A Logic's `operations` array holds read/update/delete CRUD members, Output members (`{code,content}`), and Logic references — **never a `create`** (creation is always a standalone step-level CRUD). Outputs are never standalone. `rules` MAY be empty (`[]`). `bpmn.json` carries no `module` block — the rendered XML's process-level `{"module","standard"}` is derived from `process.json` + `dbml.json`.
- `bpmn.bpmn` — rendered **raw BPMN 2.0 XML**, no markdown wrapper. Loadable in Camunda Modeler / bpmn.io. Self-contained: each subprocess is an **expandable `<bpmn:subProcess>` container** bounded by its closing `intermediateCatchEvent`; the `<bpmn:process>`-level `<bpmn:documentation>` carries `{"module","standard"}`; every task's `<bpmn:documentation>` carries its operation JSON. There are no `sendTask` nodes: Outputs live inside their Logic.
- `sipoc.json` — the SoT SIPOC set: one entry per first-level logic operation (BPMN `businessRuleTask`), keyed by `logic.id` (kebab-case) — the **only** link to BPMN (operation/subprocess/step are derived by matching the id, not stored). The set is the module's **canonical BR-NN registry**: every business rule is defined in exactly one SIPOC, with module-unique numbering. Each `process[].operation` **references a composed op `code`** from the matching Logic's `operations` array (the validator fails any process op the Logic does not compose), never re-elaborated. Suppliers/customers/input-`source`/output-`consumer` are plain-text actor labels (`User`/`System`/`All callers`, no emoji). Carries **no `module` block** — only `process.json` carries module.
- `sipoc/{kebab-id}.md` — rendered SIPOC document per Logic, filename is the `logic.id`. Each file is the self-contained SIPOC diagram of its Logic.
- `graph.json` — the SoT traceability graph built by `opscale-graph` from the four Plan JSONs above: a **nested hierarchy** of lightweight `{id, ref}` nodes (`module` → `subprocesses[]` → `steps[]` → `operations[]` → composed `operations[]`) for the whole hierarchy (Software → Domain → Module → Subprocess → Step → Operation, each Logic expanded into its composed CRUDs/logic-refs/Outputs). Every element carries its ontology id plus a JSON Pointer `ref` into the phase that owns it; nothing is duplicated. It is **island-free** in the sense that *every `ref` resolves to something real* (a dangling pointer fails the gate). There are **no `entity`/`enum`/`business-rule` nodes** and no edges — entities/enums are enumerated from `dbml.json` directly. Carries **no `module` data** — `module` is a `ref` into the sibling `process.json` (the single source). **It is the Generate phase's build manifest**: `opscale-init`/`opscale-domain`/`opscale-logic`/`opscale-ui` read it as the hierarchy of what to generate (Actions from its logic operations; entities/enums from `dbml.json`) and drill into `dbml.dbml` / `bpmn.bpmn` / `sipoc/` for per-node detail. No Plan skill reads it; it is never hand-edited — a wrong node is fixed by re-running the owning Plan skill.
- `graph.html` — the deterministic, **self-contained** HTML projection (inline CSS + JS, no network/CDN/external references): a collapsed-first, interactive card tree of the hierarchy. All card content is inlined at render time by dereferencing each node's `ref` — drill into an **entity card** (name, description, fields/types from `dbml.json`) on a CRUD op and a **SIPOC/logic card** (from `sipoc.json`) on a Logic op; module/subprocess/step/operation titles come from `process.json`/`bpmn.json`.

## What was removed

These legacy paths are no longer written or read by any skill:

- `process.txt`, `dbml.txt`, `bpmn.txt`, `sipoc.txt` — the plain `.txt` relative-ontology outlines; replaced by the schema-validated JSON source of truth per skill (the human view now travels in the deterministic projection).
- `ontology.mmd` / `ontology.txt` — the Plan closer's Mermaid treeView + outline, produced by the old `opscale-ontology`; replaced by `opscale-graph`'s `graph.json` (SoT) + `graph.html` (projection).
- `opscale-ontology` — the skill was renamed to `opscale-graph`.
- `ontology.html` — an earlier standalone lineage view; the entity name-lineage (kebab id → table → enums) now lives in `dbml.json` directly, and `graph.html` inlines each entity card from it on demand.
- `domain.dbml` → `dbml.dbml`; `logic.bpmn` / `process.bpmn` → `bpmn.bpmn`; `actions/{kebab-id}.md` → `sipoc/{kebab-id}.md`.
- `operations.md`, `subprocesses/{kebab-name}.txt` — folded into `bpmn.json` / `bpmn.bpmn`.
- `E-NN` entity ids (and the `ID` column of `names.md`), `naming.md` — replaced by the kebab-case entity id assigned by `opscale-dbml` on the final entities.
- `process.md`, `context/domain-map.md` → `context/names.md` + `process.json`, `context/system.map.md`.
- `.specify/specs/{NNN}-{module}/final/` and `logs/` — replaced by the flat `docs/plan/` layout; phase logs eliminated.
