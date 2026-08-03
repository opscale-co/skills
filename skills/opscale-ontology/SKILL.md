---
name: opscale-ontology
description: >
  Renders the planned module as a self-contained interactive HTML tree —
  Software → Domain → Module → Subprocess → Business Step → Operation, each
  Logic expanded into its composed CRUDs. Step 5 of Plan — the final Plan
  step, after opscale-sipoc, before Generate; non-interactive, reads
  docs/plan/ only. Trigger: "generate the ontology", "show the module
  hierarchy", "close the plan phase". Use it whenever a navigable Plan
  summary is wanted. Not for editing Plan artifacts — re-run the owning
  skill.
---

# opscale-ontology

## Context

### Purpose

The Plan phase produces one artifact per concern: spec, data model, flow, action detail. This skill closes the phase by rendering all of them as **one navigable view** — `docs/plan/ontology.html`, a self-contained interactive tree a stakeholder can browse offline:

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

The hierarchy is the vocabulary contract of the whole skill family (repo `ONTOLOGY.md`). This skill adds nothing to it: the HTML is a **read-only projection** — every node comes verbatim from a canonical `docs/plan/` artifact. This skill never invents, merges, renames, or fixes anything. A wrong node is fixed by re-running the skill that owns the source artifact, then re-running this one.

### Non-interactive rule

This skill asks the user nothing. If a source file is missing, or a required token cannot be found where this document says it lives, STOP and name the owning skill to re-run (`opscale-process`, `opscale-dbml`, `opscale-bpmn`, `opscale-sipoc`, or `opscale-map`). Never guess, never reconstruct a missing piece from another source.

### Prerequisites

Applies to `app` and `module` projects (the ones with a Plan phase). All paths relative to the repo root — or, when no project folder is accessible, to the conversation workspace. `opscale-init` is never a prerequisite.

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | opscale-map has run | `docs/plan/context/system.map.md` exists and lists this module | Stop. Run `/opscale-map`. |
| 2 | opscale-process has run | `docs/plan/process.txt` and `docs/plan/context/names.md` exist | Stop. Run `/opscale-process`. |
| 3 | opscale-dbml has run | `docs/plan/domain.dbml` and `docs/plan/dbml.txt` exist | Stop. Run `/opscale-dbml`. |
| 4 | opscale-bpmn has run | `docs/plan/operations.md` and `docs/plan/subprocesses/*.txt` exist | Stop. Run `/opscale-bpmn`. |
| 5 | opscale-sipoc has run | `docs/plan/actions/*.md` exist, one per Logic in `operations.md`, plus `docs/plan/sipoc.txt` | Stop. Run `/opscale-sipoc`. |

No repo, no spec-kit, no `.specify/` is required — only the `docs/plan/` documents.

### Sources and parse tokens

Read only these files (canonical layout: `references/artifact-paths.md`). The literal tokens are the contract — if one is absent, apply the Non-interactive rule.

| Source (under `docs/plan/`) | Extract | Literal tokens |
|---|---|---|
| `context/system.map.md` | software name + purpose; owning domain | `# System map — {Software}` title; `> {purpose}` line; `### {Domain}` headings; the module's table row |
| `process.txt` | subprocess names/order, triggers/waits, business steps | subprocess name line; `Trigger:` and `Ends with:` lines; numbered `N) …` step lines; blank line between blocks |
| `operations.md` | the whole operation layer | `## Subprocess {n}: {name}`; `### Atomic sequence` with `Step N) "{step}":` blocks; `### Grouped sequence` with `Logic "{name}" (id: {kebab-id})`; `### Composition` with `- {kebab-id} — business step: "{name}" — governed by: {rule}` and its indented composed-CRUD lines |
| `subprocesses/{kebab}.txt` | operations per business step, one file per subprocess | step name line; `- {category}: {operation}` lines |
| `actions/{kebab-id}.md` | per-Logic enrichment + BR-NN definitions | `**Identifier:**`, the `## Business Rules enforced` section (`BR-NN` ids), the one-sentence description after the header block, the `## Outputs` table's key column |
| `sipoc.txt` | composition cross-check | `{Logic name} ({kebab-id})` block headers |
| `dbml.txt` | entity names for CRUD badges | one entity per line |

### Output

```
docs/plan/
└── ontology.html    ← self-contained; open in any browser, works offline
```

With a writable project folder (Claude Code, or Claude Desktop on a repo/folder), write the file there directly. With no folder access, produce the same file as a downloadable output and tell the user its destination: "place it at `docs/plan/ontology.html` in the repo". Either way it is a view, never a source — no skill reads it.

## Steps

### Phase 1 — Read and parse the sources

Read every file in the Sources table. Never read anything else — in particular, never any working notes or intermediate files. Extract:

1. From `context/system.map.md`: the software name and purpose, and the domain whose module table contains this module.
2. From `process.txt`: the subprocess list (order, triggers, closing waits) and each one's business steps.
3. From `operations.md` + `subprocesses/*.txt`: every operation under its business step, with category; from the Composition section, each Logic's id, governing rules, and composed CRUD list.
4. From each `actions/{id}.md`: the one-sentence description and the Outputs keys.
5. From `dbml.txt`: the valid entity names (every entity a CRUD names must be here).

### Phase 2 — Assemble the tree and the counts

Build the hierarchy in memory: Software → owning Domain → this Module → Subprocesses (in `process.txt` order) → Business Steps (same order) → Operations (from `subprocesses/*.txt`, same order). Rules:

- A CRUD absorbed by a Logic appears only INSIDE that Logic node — mirroring the Grouped sequence, never duplicated at step level.
- ⏳ waits and 🔀 gateways render as flow markers between the steps they separate; they are flow elements, not operations, and are excluded from every count.
- Compute the stats: subprocesses, business steps, operations split by category (CRUD / Logic / Output), distinct BR-NN rules cited, distinct entities touched.

State the assembled outline briefly in the conversation (for the record — no approval question).

### Phase 3 — Fill the template and write

Copy `assets/ontology-template.html` and edit only two things:

1. The `{{…}}` placeholders in `<head>`/`<header>` (`{{SOFTWARE}}`, `{{DOMAIN}}`, `{{DOMAIN_PURPOSE}}`, `{{MODULE}}`, `{{GENERATED_ISO_DATE}}`, `{{STAT_*}}`).
2. The region between `<!-- ONTOLOGY:BEGIN -->` and `<!-- ONTOLOGY:END -->` — replace `{{TREE}}` with nested `<details>`/`<summary>` markup following `references/sample-output.md` exactly: `data-level` on every hierarchy node, `data-cat` + `data-level="operation"` on top-level operations, `data-inner="crud"` on CRUDs composed inside a Logic, `data-id` on each Logic, badges for the Logic id, BR-NN rules, and entities.

Never touch the `<style>` or `<script>` blocks. Write the result to `docs/plan/ontology.html` as raw HTML — no markdown fence, no surrounding prose. No build step: the file is authored directly, which is what keeps this skill working in Claude Desktop.

### Phase 4 — Gate (mandatory)

Run the validator from the skill directory:

```
node scripts/validate-ontology.mjs --dir=docs/plan
```

The gate is mandatory in Claude Code and Claude Desktop alike (both have console access; the script is dependency-free). Do not deliver until it exits 0. What it verifies:

- No `{{…}}` placeholder remains; the ONTOLOGY markers are present.
- Subprocess and step nodes match `process.txt` (count and order source).
- Operation nodes match the `- ` lines across `subprocesses/*.txt` (one file per subprocess block).
- The Logic count is identical in four places: `operations.md` Composition, `actions/` files, `sipoc.txt` blocks, and the HTML.
- Each Logic's inner CRUDs match its Composition list line for line.
- Every BR badge is defined in some `actions/{id}.md` (`Business Rules enforced`); every entity badge exists in `dbml.txt`.
- The header stats equal the computed counts.
- The Software › Domain chain matches `context/system.map.md`.

Then a final visual check: open the file in a browser — the tree renders, nodes collapse/expand, Expand all / Collapse all work.

## Sample

`references/sample-output.md` — a filled tree region for the recruitment module (the same running example as the other Plan skills' samples, so the ids, steps, and entities chain across artifacts).

## Success condition

`docs/plan/ontology.html` exists and `node scripts/validate-ontology.mjs --dir=docs/plan` exits 0.
