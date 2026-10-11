# BPMN validator + completeness gate

The regex-based validator was replaced by the shared Plan-contract validator. `bpmn.json` is the source of truth; `bpmn.bpmn` is a deterministic projection of it. Both scripts resolve their tooling (`bpmn-moddle`, `ajv`) from the shared `plan-contract` bundle — **never run `npm install` at runtime**.

## Phase 4 — Generate (render)

```bash
node scripts/render-bpmn.mjs --dir=docs/plan
```

Validates `docs/plan/bpmn.json` (schema + semantic rules) and projects `docs/plan/bpmn.bpmn` with `bpmn-moddle`. Exit 0 = rendered; 1 = fix the JSON.

## Phase 5 — Validate

```bash
node scripts/validate-bpmn.mjs --dir=docs/plan
```

Runs, in order:

1. **Schema** — `schema/bpmn.schema.json` (ajv, draft 2020-12). Rejects: first-level `type:"output"`; composed crud `action:"create"`; malformed `oid` / `logic.id` / codes; missing required keys; `iterative:true` with no `iterationNote`.
2. **Semantic** — oids unique and composed oids prefixed by their parent Logic oid; `position` is a 1..N sequence (and contiguous within each step); every composed `logic.ref` resolves to a first-level `logic.id`; a crud whose `entity`+`action` repeats across operations carries a `repeatReason` on each; every referenced `step` exists in the sibling `process.json` (warns if absent); every step's subprocess is declared; a `verb-noun` heuristic on `logic.id`. Exposes the first-level logic-id set (the sipoc/graph handoff).
3. **Round-trip** — re-renders in memory and **re-imports the XML through `bpmn-moddle`** (a parse error ⇒ FAIL), confirms the XML contains the expandable `<bpmn:subProcess>` containers, and confirms the on-disk `bpmn.bpmn` byte-matches the projection (no manual drift).

Exit codes: **0** PASS · **1** FAIL (schema/semantic/parse/drift) · **2** REVIEW (warnings). On 1 or 2, fix `bpmn.json` and re-render — never hand-edit the XML.

## Completeness gate (semantic checks the scripts can't do)

```
BPMN COMPLETENESS GATE
──────────────────────────────────────────────────────
[ ] Modeling standard read from docs/plan/dbml.dbml (or "none") and recorded in bpmn.json module.standard
[ ] As-is subprocesses reconciled against the standard — add/drop/merge/split/rename decisions explicit
[ ] docs/plan/process.json updated to match the to-be subprocess list (if reconciliation changed it)
[ ] Every subprocess walked: rules (2.1) → atomic sequence (2.2) → grouped Logics (2.3) → detailed recap (2.4)
[ ] Every first-level operation is crud or logic — never output; every Output composed inside a Logic
[ ] Creation is always a standalone first-level crud — no composed crud has action:"create"
[ ] Every Logic carries rules (BR-NN) + composed (crud read|update|delete / logic ref / output)
[ ] Every lifecycle status transition lives inside a Logic (no standalone update-status crud)
[ ] Every approval modeled two-outcome (approve-x / reject-x) with its gateway
[ ] Every crud entity exists in docs/plan/dbml.dbml; every gateway branch targets a real oid
[ ] Every composed logic.ref resolves to a first-level logic.id (reuse by reference, never re-expanded)
[ ] node scripts/validate-bpmn.mjs --dir=docs/plan exits 0
[ ] docs/plan/bpmn.json (source of truth) + docs/plan/bpmn.bpmn (projection) written
──────────────────────────────────────────────────────
STATUS: [ ] PASS — opscale-sipoc may proceed   [ ] FAIL — list blocking items
```
