# BPMN validator + completeness gate

## Phase 4 — Run the bundled validator

Assemble the complete BPMN 2.0 XML and write it to `docs/plan/bpmn.bpmn`. The validator accepts a raw `.bpmn` file (or, legacy, a markdown file with the XML in a fenced ```xml block). Run it from the skill bundle directory so its bundled `node_modules` resolve — dependencies ship inside the skill; **never run `npm install` at runtime**, and never write temp files outside the workspace (no `/tmp` — if a scratch file is ever needed, keep it inside the workspace and delete it afterwards):

```bash
node scripts/validate-bpmn.mjs docs/plan/bpmn.bpmn --txt=docs/plan/bpmn.txt --process=docs/plan/process.txt
```

(Adjust the `docs/plan/bpmn.bpmn` argument to its absolute path if the current directory is not the repo root.)

Exit codes:

- **1** — XML/BPMN structure error: fix `docs/plan/bpmn.bpmn` and re-run.
- **2** — Quality warnings (forbidden task types, missing docs, unlabelled gateway branches, orphan tasks, missing start/end events): fix and re-run.
- **0** — Proceed to Phase 5.

The script never gets copied to the project — it stays in the skill bundle. The gate is mandatory in both Claude Code and Claude Desktop.

## Phase 5 — Completeness gate (semantic checks the script can't do)

```
BPMN COMPLETENESS GATE
──────────────────────────────────────────────────────
[ ] Modeling standard read from docs/plan/dbml.dbml (or "none") and recorded
[ ] As-is subprocesses reconciled against the standard — added / dropped / merged / split / renamed decisions are explicit
[ ] docs/plan/process.txt updated to match the to-be subprocess list (if reconciliation changed it)
[ ] Flow list approved before any step classification began
[ ] Every subprocess walked: rules elicited (2.1) → atomic sequence confirmed (2.2) → grouped sequence confirmed (2.3) → detailed recap confirmed (2.4)
[ ] Every operation is exactly one of CRUD / Logic / Output / Event / Gateway — and every Output is composed inside a Logic (never a standalone step or a sendTask node)
[ ] Every Logic's documentation JSON carries "rules" (from 2.1) and "composed" (its CRUD members `{oid,entity,action}` and Output members `{oid,content}`) — the XML is self-contained
[ ] Every task's documentation JSON carries "step" and "subprocess" — no orphan operations
[ ] Grouping in 2.3 preserved the order of 2.2 (collapsed contiguous CRUDs, did not reorder)
[ ] CRUDs absorbed by a Logic do NOT appear as standalone serviceTask nodes
[ ] Script exited with code 0
[ ] docs/plan/bpmn.bpmn written (raw XML, no markdown wrapper)
[ ] docs/plan/bpmn.txt written — one section per subprocess block of docs/plan/process.txt (same count, order, names); every business step present with ≥1 operation; each logic line carries its composed CRUDs AND Outputs indented; no top-level output line
[ ] BPMN is flat — no subProcess containers; each subprocess from docs/plan/process.txt is a segment closed by the intermediateCatchEvent from its *Ends with:* wait (grouping recorded in each task's "subprocess" metadata and in bpmn.txt)
[ ] Only serviceTask and businessRuleTask nodes used — no sendTask (Outputs are composed), no scriptTask
[ ] Every crud serviceTask entity exists in docs/plan/dbml.dbml
[ ] Every crud serviceTask has valid action (create|read|update|delete)
[ ] Every businessRuleTask `name` is verb + noun in natural language (sentence case, no PascalCase, no abbreviations)
[ ] Every businessRuleTask has a logic id in kebab-case matching its name
[ ] Every composed Output member has `content` (brief WHAT, no channel) and a nested `SP-XX-YY-LZZ-OAA` oid; no Output stands alone
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
