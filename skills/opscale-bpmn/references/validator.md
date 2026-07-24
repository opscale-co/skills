# BPMN validator + completeness gate

## Phase 4 — Run the bundled validator

Assemble the complete BPMN 2.0 XML in memory — do not write the file yet. The validator accepts a raw `.bpmn` file (or, legacy, a markdown file with the XML in a fenced ```xml block). For this skill, write to a `.bpmn` temp file and validate:

```bash
# bpmn-moddle is already bundled in this skill's node_modules — no install needed

cat > /tmp/.bpmn-validate.tmp.bpmn << 'TMPEOF'
[assembled BPMN XML]
TMPEOF
node {SKILL_DIR}/opscale-bpmn/scripts/validate-bpmn.mjs /tmp/.bpmn-validate.tmp.bpmn
```

Exit codes:

- **1** — XML/BPMN structure error: fix and re-run.
- **2** — Quality warnings (forbidden task types, missing docs, unlabelled gateway branches, orphan tasks, missing start/end events): fix and re-run.
- **0** — Proceed to Phase 5.

The script never gets copied to the project — it stays in the skill bundle.

## Phase 5 — Completeness gate (semantic checks the script can't do)

```
BPMN COMPLETENESS GATE
──────────────────────────────────────────────────────
[ ] Modeling standard read from final/domain.dbml (or "none") and recorded
[ ] As-is subprocesses reconciled against the standard — added / dropped / merged / split / renamed decisions are explicit
[ ] final/process.md *Ordered flow* updated to match the to-be subprocess list (if reconciliation changed it)
[ ] Flow list approved before any step classification began
[ ] Every subprocess walked: rules elicited (2.1) → atomic sequence confirmed (2.2) → grouped sequence confirmed (2.3) → detailed recap confirmed (2.4)
[ ] Every step is exactly one of CRUD / Logic / Output / Event / Gateway — nothing else
[ ] Every Logic has its CRUD composition documented in final/operations.md and traces back to a business rule from 2.1
[ ] Every operation in final/operations.md is labeled with the business step it decomposes — no orphan operations
[ ] Grouping in 2.3 preserved the order of 2.2 (collapsed contiguous CRUDs, did not reorder)
[ ] CRUDs absorbed by a Logic do NOT appear as standalone serviceTask nodes
[ ] Script exited with code 0
[ ] final/process.bpmn written (raw XML, no markdown wrapper)
[ ] final/operations.md written (atomic sequence + grouped sequence + composition per subprocess)
[ ] final/bpmn.txt written — every business step from final/process.txt present, same order, ≥1 operation each
[ ] logs/bpmn.md written
[ ] One subProcess per flow in final/process.md *Ordered flow*
[ ] Only serviceTask, businessRuleTask, sendTask used — no scriptTask
[ ] Every crud serviceTask entity exists in final/domain.dbml
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
