---
name: opscale-ontology
description: >
  Renders the planned module as a Mermaid treeView — Software → Domain →
  Module → Subprocess → Business Step → Operation, each Logic expanded into
  its composed CRUDs and Outputs. Step 5 of Plan — the final Plan step, after
  opscale-sipoc, before Generate; non-interactive, reads docs/plan/ only.
  Trigger: "generate the ontology", "show the module hierarchy", "close the
  plan phase". Use it whenever a navigable Plan summary is wanted. Not for
  editing Plan artifacts — re-run the owning skill.
---

# opscale-ontology

## Context

### Purpose

The Plan phase produces one artifact per concern: spec, data model, flow, action detail. This skill closes the phase by rendering all of them as **one navigable view** — two outputs named after the skill:

- `docs/plan/ontology.mmd` — the **diagram**: a Mermaid `treeView-beta` (Mermaid ≥ 11.14; renders in VS Code, mermaid.live, and Mermaid-enabled viewers) of the whole hierarchy, **self-contained**: its `%%` metadata lines carry the module/domain/software chain (project ids `xxx/yyy`) and the full kebab-id name lineage, so no other file is needed to interpret it.
- `docs/plan/ontology.txt` — the **relative ontology**: the same hierarchy as a plain indented outline.

```
Software (app)
└── Domain                  a business line
    └── Subdomain (module)  ONE business process — this module
        └── Subprocess      a wait-bounded (⏳) segment of the flow
            └── Business Step   a broad business activity, stakeholder language
                └── Operation   atomic and technical — CRUD | Logic | Output
                    └── (inside each Logic) the composed CRUDs the business
                        rule forces to run together — the future Action
```

The hierarchy is the vocabulary contract of the whole skill family (repo `ONTOLOGY.md`). This skill adds nothing to it: both outputs are **read-only projections** — every node comes verbatim from a canonical `docs/plan/` artifact. This skill never invents, merges, renames, or fixes anything. A wrong node is fixed by re-running the skill that owns the source artifact, then re-running this one.

The `%%` metadata is the assembled name lineage: one line per entity (kebab id from the `{kebab} — ` stamp that opens each Table Note in `dbml.dbml`), plus one line per external `ref:{slug}`. The lineage lives in the artifacts (id stamps); the diagram is where humans read it assembled.

### Non-interactive rule

This skill asks the user nothing. If a source file is missing, or a required token cannot be found where this document says it lives, STOP and name the owning skill to re-run (`opscale-process`, `opscale-dbml`, `opscale-bpmn`, `opscale-sipoc`, or `opscale-map`). Never guess, never reconstruct a missing piece from another source.

### Prerequisites

Applies to `app` and `module` projects (the ones with a Plan phase). All paths relative to the repo root — or, when no project folder is accessible, to the conversation workspace. `opscale-init` is never a prerequisite.

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | opscale-map has run | `docs/plan/context/system.map.md` exists and lists this module | Stop. Run `/opscale-map`. |
| 2 | opscale-process has run | `docs/plan/process.txt` and `docs/plan/context/names.md` exist | Stop. Run `/opscale-process`. |
| 3 | opscale-dbml has run | `docs/plan/dbml.dbml` and `docs/plan/dbml.txt` exist; every Table Note opens with its kebab id | Stop. Run `/opscale-dbml`. |
| 4 | opscale-bpmn has run | `docs/plan/bpmn.bpmn` (embedded documentation JSON) and `docs/plan/bpmn.txt` exist | Stop. Run `/opscale-bpmn`. |
| 5 | opscale-sipoc has run | `docs/plan/sipoc/*.md` exist, one per unique Logic id in `bpmn.bpmn`, plus `docs/plan/sipoc.txt` | Stop. Run `/opscale-sipoc`. |

No repo, no spec-kit, no `.specify/` is required — only the `docs/plan/` documents.

### Sources and parse tokens

Read only these files (canonical layout: `references/artifact-paths.md`). The literal tokens are the contract — if one is absent, apply the Non-interactive rule.

| Source (under `docs/plan/`) | Extract | Literal tokens |
|---|---|---|
| `context/system.map.md` | software name + purpose; owning domain | `# System map — {Software}` title; `> {purpose}` line; `### {Domain}` headings; the module's table row |
| `process.txt` | subprocess ids/names/order, triggers/waits, business steps | `SP-XX {name}` block line; `Trigger:` and `Ends with:` lines; local `YY) …` step lines; blank line between blocks |
| `bpmn.txt` | the whole operation layer: step → operations (with oids), Logic → composed CRUDs, Logic references and Outputs | one section per subprocess (`SP-XX {name}` first line); top-level `- {oid} crud|logic: …`; each `- {oid} logic: {kebab-id}` with its composed members indented (`  - {oid}-CAA crud:` / `  - {oid}-LAA logic:` / `  - {oid}-OAA output:`) |
| `bpmn.bpmn` | cross-check: oids, unique logic ids, rules, composed arrays | task `<documentation>` JSON (`"type"`, `"oid"`, `"id"`); `<bpmn:process>` documentation (`"module"`) |
| `sipoc/{kebab-id}.md` | per-Logic enrichment + BR-NN definitions | `**Identifier:**`, the `## Business Rules enforced` section (`BR-NN` ids), the one-sentence description after the header block |
| `sipoc.txt` | composition cross-check | `{Logic name} ({kebab-id})` block headers |
| `dbml.txt` | entity names for CRUD nodes | one entity per line |
| `context/names.md` | alias support for the lineage lines | `| {Canonical} | {aliases} |` table rows |
| `dbml.dbml` | entity ids + enums per table | `Table {name} {` blocks; the `{kebab} — ` opening of each `Note:`; `Enum {Name} {` declarations |
| `context/external-refs.md` (optional) | external `ref:{slug}` metadata | fenced ```` ```external-refs ```` block, `{slug}: {col, col}` lines |

### Output

```
docs/plan/
├── ontology.mmd    ← Mermaid treeView-beta; view in VS Code / mermaid.live
└── ontology.txt    ← the same hierarchy, plain indented outline
```

With a writable project folder (Claude Code, or Claude Desktop on a repo/folder), write the files there directly. With no folder access, produce the same files as downloadable outputs and tell the user their destinations. Either way they are views, never sources — no skill reads them.

### ontology.mmd format (the contract)

Header, metadata, then the tree — indentation only (4 spaces per level), labels quoted, `/` suffix on nodes with children:

```
treeView-beta
%% module: {xxx/yyy} | domain: {Domain Name} ({xxx}) | software: {Software}
%% entity: {kebab} | {Business name} | {aliases or —} | {table} | {enums or —}
%% external: ref:{slug} | {referencing columns}
    "{Software}"/
        "{Domain Name}"/
            "{Module Name}"/
                "⏳ SP-XX {Subprocess}"/
                    "SP-XX-YY {Business step}"/
                        "📝 SP-XX-YY-CZZ {action} {entity}"
                        "⚙️ SP-XX-YY-LZZ {kebab-id} [BR-NN, BR-NN]"/
                            "📝 SP-XX-YY-LZZ-CAA {action} {entity}"
                            "⚙️ SP-XX-YY-LZZ-LAA {leaf-kebab-id}"
                            "📩 SP-XX-YY-LZZ-OAA {brief output content}"
```

Rules:

- **Every node label carries its ontology id**: `SP-XX` on subprocesses, `SP-XX-YY` on steps, the operation `oid` (`SP-XX-YY-[C|L]ZZ` standalone, nested `…-[C|L|O]AA` on composed CRUDs/Outputs) on operations — verbatim from `process.txt` and the `oid` keys of `bpmn.bpmn`/`bpmn.txt`. Domain and subdomain ids are the project slugs (`xxx`, `xxx/yyy`) from `context/system.map.md`, carried in the `%% module:` line (top-level labels stay names).
- One `%% entity:` line per **stamped table** of `dbml.dbml`, in declaration order: the kebab id that opens the table's Note, the business name, the aliases folded in `names.md` (`—` if the entity was born in reconciliation), the table, and the Enum types its columns use (`—` if none). Aliases are matched against `names.md` by the entity's business name — or, when the entity was renamed in reconciliation, by the ` (spec: {canonical})` stamp closing its table Note in `dbml.dbml`; a renamed entity without that stamp gets `—` (never guess the mapping). One `%% external:` line per `external-refs.md` slug (omit if the module has none).
- Node prefixes are the category emojis (same vocabulary as the rest of the family): `⏳` subprocess, `⚙️` Logic, `📝` CRUD, `📩` Output. Business steps and the top three levels carry no emoji.
- **CRUDs, Logic references, and Outputs absorbed by a Logic appear only INSIDE that Logic node** (one indent deeper) — mirroring `bpmn.txt`. Standalone step-level operations are only `📝` CRUD and `⚙️` Logic; an `📩` Output is **never** a step-level node — it is always a child of the Logic that dispatches it. A composed `⚙️` reference is a **leaf**: bare `{oid} {leaf-kebab-id}`, no BR badges, no children, no trailing `/` — the leaf Action's expansion (and its BRs) lives at its own standalone node.
- Labels are **concise** (the detail lives in the SIPOCs): CRUD = `{action} {entity}`; Logic = the bare kebab Action id plus its cited `[BR-NN, …]` (the natural name lives in the BPMN `name=`); Output = the brief content, never a channel.
- Waits and gateways are flow elements, not operations — they do not appear as tree nodes (the `⏳` on the subprocess node is its wait boundary).

### ontology.txt format

The same hierarchy, markdown-free: 2-space indent per level, category words instead of emojis, no quotes:

```
{Software}
  {Domain Name}
    {Module Name}
      SP-XX {Subprocess}
        SP-XX-YY {Business step}
          SP-XX-YY-CZZ crud: {action} {entity}
          SP-XX-YY-LZZ logic: {kebab-id}
            SP-XX-YY-LZZ-CAA crud: {action} {entity}
            SP-XX-YY-LZZ-LAA logic: {leaf-kebab-id}
            SP-XX-YY-LZZ-OAA output: {brief output content}
```

## Steps

### Phase 1 — Read and parse the sources

Read every file in the Sources table. Never read anything else — in particular, never any working notes or intermediate files. Extract:

1. From `context/system.map.md`: the software name and purpose, and the domain whose module table contains this module.
2. From `process.txt`: the subprocess list (order, triggers, closing waits) and each one's business steps.
3. From `bpmn.txt`: every operation under its business step, with category; each Logic's composed CRUD list (the indented lines beneath it).
4. From `bpmn.bpmn`: the unique logic ids and each one's documentation JSON (`rules`, `composed`) — cross-check they match `bpmn.txt` exactly.
5. From each `sipoc/{id}.md`: the one-sentence description and the BR-NN ids its `Business Rules enforced` section defines or cites.
6. From `dbml.txt`: the valid entity names (every entity a CRUD names must be here).
7. From `context/names.md`: the `| Canonical | aliases |` rows — alias support for the lineage metadata (the ids themselves come from the dbml stamps).
8. From `dbml.dbml`: per `Table` block, the kebab id that opens its `Note:` (≡ table name with dashes) and the Enum types its columns use.
9. From `context/external-refs.md` (if present): each `{slug}: {columns}` line of the fenced block.

### Phase 2 — Assemble the tree and the counts

Build the hierarchy in memory: Software → owning Domain → this Module → Subprocesses (in `process.txt` order) → Business Steps (same order) → Operations (from `bpmn.txt`, same order). Compute the counts the gate will verify: subprocesses, business steps, operations by category (CRUD / Logic / Output), unique Logic ids, distinct BR-NN cited, distinct entities touched, lineage rows.

Assemble the `%%` metadata lines (module chain + one line per entity + one per external ref) exactly as the format contract specifies.

State the assembled outline briefly in the conversation (for the record — no approval question).

### Phase 3 — Write the two outputs

Author `docs/plan/ontology.mmd` (header + `%%` metadata + tree, following the format contract and `references/sample-output.md`) and `docs/plan/ontology.txt` (same hierarchy as the plain outline). No build step, no HTML, no markdown fences inside the files — both are written directly, which is what keeps this skill working in Claude Desktop.

### Phase 4 — Gate (mandatory)

Run the validator from the skill directory:

```
node scripts/validate-ontology.mjs --dir=docs/plan
```

The gate is mandatory in Claude Code and Claude Desktop alike (both have console access; the script is dependency-free). Do not deliver until it exits 0. It first runs a self-contained **Mermaid syntax linter** (Node stdlib, no bundled Mermaid) over `ontology.mmd` — `treeView-beta` header, balanced double-quotes per line, quoted labels, indentation a consistent multiple that only deepens one level at a time, and a trailing `/` on every parent node — so a tree that would not render fails here, not in the viewer. Then the semantic cross-checks:

- `ontology.mmd` opens with `treeView-beta` and the `%% module:` chain (project ids `xxx/yyy` + names) matches `context/system.map.md`.
- Subprocess (`⏳ SP-XX`) and step (`SP-XX-YY`) nodes match `process.txt` — ids, counts, and order.
- Operation nodes match the op lines of `bpmn.txt` **oid by oid**; each `⚙️` node's inner `📝`/`⚙️`/`📩` children match its composed CRUDs, Logic references, and Outputs line for line; no `📩` Output is top-level; every composed `⚙️` reference names a logic id that exists as a `businessRuleTask` in `bpmn.bpmn`.
- The Logic count is identical across sources: unique ids in `bpmn.bpmn`, `bpmn.txt` logic lines, `sipoc/` files, `sipoc.txt` blocks, and the tree's `⚙️` nodes.
- Every `[BR-NN]` cited on a `⚙️` node is defined in some `sipoc/{id}.md` (`Business Rules enforced`); every entity in a `📝` node exists in `dbml.txt`.
- The `%% entity:` lines are exactly one per stamped table of `dbml.dbml` — kebab id and table cell match the stamp, every enum listed is a declared Enum, and every `external-refs.md` slug has its `%% external:` line.
- `ontology.txt` mirrors the tree: same node counts per level and category.

The Mermaid linter above already guarantees the file renders; an optional final look in a Mermaid renderer (VS Code preview or mermaid.live) confirms the tree reads well as a collapsible file-browser-style view.

## Sample

`references/sample-output.md` — a filled `ontology.mmd` + `ontology.txt` excerpt for the Proveedores module (supplier master lifecycle — the same running example as the other Plan skills' samples, so the ids, steps, and entities chain across artifacts).

## Success condition

`docs/plan/ontology.mmd` + `docs/plan/ontology.txt` exist and `node scripts/validate-ontology.mjs --dir=docs/plan` exits 0.
