---
name: opscale-graph
description: >
  Closes the Plan phase: builds the module's traceability graph from the Plan
  JSONs — graph.json (a nested {id, ref} hierarchy, each ref-ing the phase that
  owns it) + graph.html (an interactive, self-contained card tree). Step 5 of
  Plan, after opscale-sipoc, before Generate; non-interactive, reads
  docs/plan/*.json. Trigger: "generate the graph", "show the module hierarchy",
  "close the plan phase". Not for editing Plan artifacts — re-run the owner.
---

# opscale-graph

## Context

### Purpose

The Plan phase produces one validated JSON per concern — `process.json` (spec/flow), `dbml.json` (data model), `bpmn.json` (operation flow), `sipoc.json` (action detail). This skill **closes** the phase by assembling all four into **one traceability graph** — two outputs named after the skill:

- `docs/plan/graph.json` — the **source of truth** this skill builds: a **nested hierarchy** of lightweight `{id, ref}` nodes (`module` → `subprocesses[]` → `steps[]` → `operations[]` → composed `operations[]`). Every element carries its ontology id plus a JSON Pointer `ref` into the phase file that owns its content, so graphify (and any consumer) can dereference the element straight to its definition. Nothing is duplicated — no titles, names, or bodies; all are derivable through `ref`. It is **island-free** in the sense that *every `ref` resolves to something real*.
- `docs/plan/graph.html` — the **diagram**: an interactive, **self-contained** HTML card tree (inline CSS + JS, no network/CDN/external references — opens offline) of the whole hierarchy. It is a deterministic projection of `graph.json` with every card's content inlined at render time by dereferencing each node's `ref` into the four sources, so no other file is needed to read it.

```
Software (app)
└── Domain                  a business line
    └── Subdomain (module)  ONE business process — this module
        └── Subprocess      a wait-bounded (⏳) segment of the flow
            └── Business Step   a broad business activity, stakeholder language
                └── Operation   atomic and technical — CRUD | Logic | Output
                    └── (inside each Logic) the composed CRUDs/logic-refs/
                        outputs the business rule forces to run together
```

The hierarchy is the vocabulary contract of the whole skill family. This skill adds nothing to it: both outputs are **deterministic projections** — every node comes verbatim from a canonical `docs/plan/` JSON. This skill never invents, merges, renames, or fixes anything. A wrong node is fixed by re-running the skill that owns the source JSON, then re-running this one.

### Non-interactive rule

**This skill asks the user nothing and authors nothing.** It reads the four sibling JSONs and *builds* the graph. If a source file is missing, or a build/semantic check fails, STOP and name the owning skill to re-run (`opscale-process`, `opscale-dbml`, `opscale-bpmn`, or `opscale-sipoc`). Never guess, never reconstruct a missing piece from another source.

### The JSON contract

`graph.json` is validated against `schema/graph.schema.json` (which `$ref`s the shared `common.schema.json`). The schema is a hard gate. Shape — a **nested hierarchy**, not flat nodes/edges:

```jsonc
{
  "module": { "ref": "process.json#/module" },   // a REFERENCE, not duplicated data
  "subprocesses": [ {
    "id": "SP-01",
    "ref": "process.json#/subprocesses/0",
    "steps": [ {
      "id": "SP-01-02",
      "ref": "process.json#/subprocesses/0/steps/1",
      "operations": [ {
        "id": "SP-01-02-L01",
        "ref": "bpmn.json#/operations/SP-01/SP-01-02/1",   // first-level op
        "operations": [ {                                   // composed children (logic ops only)
          "id": "SP-01-02-L01-C01",
          "ref": "bpmn.json#/operations/SP-01/SP-01-02/1/operations/0"
        } ]
      } ]
    } ]
  } ]
}
```

Every element carries an `id` + a `ref` (an RFC-6901 JSON Pointer into the owning source file). `module` is itself a **reference** into `process.json` — module (software/domain/subdomain) is never duplicated here. First-level operations ref `bpmn.json#/operations/{SP}/{step}/{idx}`; composed operations append `/operations/{j}`. Composed children nest under a logic op's `operations[]` (crud/output ops carry no `operations`). No titles, names, or content are duplicated — all are derivable by dereferencing `ref`.

**Hierarchy rule (schema-enforced where possible, semantic otherwise).** The spine is EXACTLY `module → subprocess → step → operation → composed-operation`, nested directly (no edges). The schema enforces each level's id grammar (`subprocessCode` / `stepCode` / `opCode` | `composedOpCode`) and the nesting; `additionalProperties:false` at every level. There are no `entity`/`enum`/`business-rule` nodes — those registries live in `dbml.json`/`sipoc.json` and are enumerated there directly.

**Semantic rules (the core of this skill, checked by the validator):**

- **Hierarchy id consistency** — a step id is prefixed by its subprocess id, an operation id by its step id, a composed-operation id by its parent operation id. A break fails.
- **Every `ref` resolves** — each `ref` is parsed as `<file>.json#<json-pointer>` and the pointer must actually resolve in that sibling JSON (e.g. `bpmn.json#/operations/SP-01/SP-01-02/1` exists). A dangling ref is a FAIL — this is the **island-free / everything-points-to-something-real** guarantee, and what makes the graph graphify-dereferenceable.
- **Counts parity** with the sources — `#subprocess == process.json subprocesses`, `#step == total steps`, `#operation == bpmn first-level operations`, `#composed-operation == total composed members`, and `#logic operations == #sipocs` (the Logic-id set equals the SIPOC-id set).
- Then `graph.html` is re-rendered, asserted **self-contained** (no `http(s)://` / `src=` / `cdn` / `<script src>` / `<link>`), non-empty, carrying the expected card markers, and confirmed to match the on-disk file.

### Prerequisites

Applies to **app** and **module** projects (the ones with a Plan phase). All paths relative to the repo root — or, when no project folder is accessible, to the conversation workspace. `opscale-init` is never a prerequisite.

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | opscale-process ran | `docs/plan/process.json` exists, passed | Stop. Run `/opscale-process`. |
| 2 | opscale-dbml ran | `docs/plan/dbml.json` exists, passed | Stop. Run `/opscale-dbml`. |
| 3 | opscale-bpmn ran | `docs/plan/bpmn.json` exists, passed | Stop. Run `/opscale-bpmn`. |
| 4 | opscale-sipoc ran | `docs/plan/sipoc.json` exists, passed | Stop. Run `/opscale-sipoc`. |

No repo, no spec-kit, no `.specify/` is required — only the four `docs/plan/` JSONs.

### What each source contributes to the graph

| Source | What it owns in the tree | How it surfaces in `graph.html` |
|---|---|---|
| `process.json` | `module` (ref), `subprocess` (SP-XX), `step` (SP-XX-YY) — the nested spine | module/subprocess/step card titles + descriptions |
| `bpmn.json` | `operation` (oid), composed `operation` (nested oid) | operation card type/action/entity/content |
| `dbml.json` | — (entities/enums are NOT graph nodes; enumerated from `dbml.json` directly) | the **entity card** (name, description, fields/types) opened from a CRUD op |
| `sipoc.json` | — (SIPOCs are not graph nodes) | the **logic card** (SIPOC detail) opened from a Logic op |

### graph.html (the projection)

A single **self-contained** HTML file (inline CSS + JS, no network/CDN/external references — it opens offline). It is the deterministic projection of `graph.json`, with each card's content inlined at render time by dereferencing every node's `ref` into the four sources. Behaviour:

- **Progressive disclosure, starting collapsed.** Initially only the **module card** shows. Clicking it reveals its **subprocess** cards; clicking a subprocess reveals its **step** cards; clicking a step reveals its **operation** cards. (An "Expand all" / "Collapse all" toolbar is provided.)
- **A Logic operation, expanded,** shows its **logic card** — the SIPOC detail for that logic id (description, inputs, process steps, outputs, business rules, failure modes from `sipoc.json`) — followed by its nested composed child operations.
- **A CRUD operation, expanded,** opens the **entity card** for the entity it acts on (name, description, and its fields/types from `dbml.json`).
- **An Output operation** is a leaf (brief content, no drill-in).

Five card types with distinct styling — **subprocess, step, operation** (sub-style crud / logic / output), **entity, logic** — plus the root **module** card. Each card's data is derived at render time: subprocess/step titles+descriptions from `process.json`; operation type/entity/action/description from `bpmn.json`; entity fields from `dbml.json`; logic SIPOC from `sipoc.json`; module name from `process.json`'s `module`. The page is theme-aware (`prefers-color-scheme`). All JS is vanilla and inlined; the file is never hand-edited.

### Output

```
docs/plan/
├── graph.json    ← the traceability graph (built here; nested {id, ref} hierarchy; graphify-ingestible)
└── graph.html    ← interactive, self-contained card tree; open in any browser, offline
```

With a writable project folder, the skill writes both files directly. With no folder access, it produces the same files as downloadable outputs and names their destinations. Either way they are projections of the four Plan JSONs — never hand-edited.

## Steps

### Phase 0 — Verify the four sources (STOP-gate)

Confirm `docs/plan/process.json`, `dbml.json`, `bpmn.json`, and `sipoc.json` all exist and passed their own gates. If any is missing, STOP and name the owning skill to run (`/opscale-process`, `/opscale-dbml`, `/opscale-bpmn`, `/opscale-sipoc`) — do not build a partial graph.

### Phase 1 — Generate (agent)

Spawn `plan-generator` (skill: `graph`). It runs:

```
node scripts/render-graph.mjs --dir=docs/plan
```

The script is **non-interactive and needs no JSON payload**: `generate()` reads the four sibling JSONs, deterministically BUILDS `docs/plan/graph.json` (the nested `{id, ref}` hierarchy), validates it against the schema and the semantic rules, then projects `docs/plan/graph.html`. Replace existing files (any stale `graph.mmd` is removed). Never hand-edit either output.

### Phase 2 — Validate (agent)

Spawn `plan-validator` (skill: `graph`). It runs:

```
node scripts/validate-graph.mjs --dir=docs/plan
```

The gate re-checks the on-disk `graph.json`: schema, **hierarchy id consistency** (step id prefixed by its subprocess, op by its step, composed op by its parent op), **every `ref` resolves** in its owning sibling JSON (the island-free guarantee), **counts parity** with the sources (subprocess/step/first-level-op/composed-op, and #logic == #sipocs), then re-renders `graph.html`, asserts it is **self-contained** (no external/network references) with the expected card markers, and confirms the on-disk file matches the projection. A failed gate is fixed by re-running the owning Plan skill and regenerating — never silently patched. The skill does not close until it exits 0.

## Success condition

```bash
node scripts/validate-graph.mjs --dir=docs/plan
```

Exit code 0 = pass (1 = fail, 2 = review warnings). `docs/plan/graph.json` + `docs/plan/graph.html` exist and are coherent with the four Plan JSONs.
