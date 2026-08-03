# BPMN validator + completeness gate

## Phase 4 — Run the bundled validator

Assemble the complete BPMN 2.0 XML and write it to `docs/plan/logic.bpmn`. The validator accepts a raw `.bpmn` file (or, legacy, a markdown file with the XML in a fenced ```xml block). Run it from the skill bundle directory so its bundled `node_modules` resolve — dependencies ship inside the skill; **never run `npm install` at runtime**, and never write temp files outside the workspace (no `/tmp` — if a scratch file is ever needed, keep it inside the workspace and delete it afterwards):

```bash
node scripts/validate-bpmn.mjs docs/plan/logic.bpmn
```

(Adjust the `docs/plan/logic.bpmn` argument to its absolute path if the current directory is not the repo root.)

Exit codes:

- **1** — XML/BPMN structure error: fix `docs/plan/logic.bpmn` and re-run.
- **2** — Quality warnings (forbidden task types, missing docs, unlabelled gateway branches, orphan tasks, missing start/end events): fix and re-run.
- **0** — Proceed to Phase 5.

The script never gets copied to the project — it stays in the skill bundle. The gate is mandatory in both Claude Code and Claude Desktop.

## Phase 5 — Completeness gate (semantic checks the script can't do)

```
BPMN COMPLETENESS GATE
──────────────────────────────────────────────────────
[ ] Modeling standard read from docs/plan/domain.dbml (or "none") and recorded
[ ] As-is subprocesses reconciled against the standard — added / dropped / merged / split / renamed decisions are explicit
[ ] docs/plan/process.txt updated to match the to-be subprocess list (if reconciliation changed it)
[ ] Flow list approved before any step classification began
[ ] Every subprocess walked: rules elicited (2.1) → atomic sequence confirmed (2.2) → grouped sequence confirmed (2.3) → detailed recap confirmed (2.4)
[ ] Every step is exactly one of CRUD / Logic / Output / Event / Gateway — nothing else
[ ] Every Logic has its CRUD composition documented in docs/plan/operations.md and traces back to a business rule from 2.1
[ ] Every operation in docs/plan/operations.md is labeled with the business step it decomposes — no orphan operations
[ ] Grouping in 2.3 preserved the order of 2.2 (collapsed contiguous CRUDs, did not reorder)
[ ] CRUDs absorbed by a Logic do NOT appear as standalone serviceTask nodes
[ ] Script exited with code 0
[ ] docs/plan/logic.bpmn written (raw XML, no markdown wrapper)
[ ] docs/plan/operations.md written (atomic sequence + grouped sequence + composition per subprocess)
[ ] docs/plan/subprocesses/{kebab}.txt written — one file per subprocess block of docs/plan/process.txt (same count, order, names); every business step present with ≥1 operation
[ ] BPMN is flat — no subProcess containers; each subprocess from docs/plan/process.txt is a segment closed by the intermediateCatchEvent from its *Ends with:* wait (grouping recorded in docs/plan/operations.md)
[ ] Only serviceTask, businessRuleTask, sendTask used — no scriptTask
[ ] Every crud serviceTask entity exists in docs/plan/domain.dbml
[ ] Every crud serviceTask has valid action (create|read|update|delete)
[ ] Every businessRuleTask `name` is verb + noun in natural language (sentence case, no PascalCase, no abbreviations)
[ ] Every businessRuleTask has a logic id in kebab-case matching its name
[ ] Every sendTask has channel and trigger attributes
[ ] Simple queries use serviceTask (crud read) — not businessRuleTask
[ ] Every gateway branch has a condition label
[ ] Start event and at least one end event present
[ ] Every task has incoming and outgoing flows
[ ] No orphaned elements
[ ] Complete BPMNDiagram section with shapes and edges
──────────────────────────────────────────────────────
STATUS: [ ] PASS — opscale-sipoc may proceed
        [ ] FAIL — list blocking items below
```
