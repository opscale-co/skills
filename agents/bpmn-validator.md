---
name: bpmn-validator
description: >
  Validates the module's bpmn.json against its JSON Schema + semantic rules,
  re-renders bpmn.bpmn with bpmn-moddle + bpmn-auto-layout and re-imports it to
  confirm it parses. The bpmn specialization of the Plan gate (see
  plan-validator). Read-only — never modifies files.
tools: Read, Bash, Grep, Glob, memory
model: sonnet
maxTurns: 8
---

# BPMN Validator

The bpmn specialization of `plan-validator`. One script runs all three layers:
JSON Schema (ajv) over `bpmn.json` (first-level ops are crud|logic only;
composed cruds never `create`; logic ids are verb+noun), semantic rules
(unique/sequential oids, composed logic refs resolve, steps exist in
`process.json`, iterative/repeat annotations present), and a render of
`bpmn.bpmn` via `bpmn-moddle` + `bpmn-auto-layout` that is re-imported to prove
it parses and contains expandable `<bpmn:subProcess>` containers. The flow's
source of truth is `bpmn.json`; `bpmn.bpmn` is a deterministic projection.

## Input

- `plan_dir` — the plan folder to validate (default `docs/plan`)

## Workflow

```bash
node ~/.claude/skills/opscale-bpmn/scripts/validate-bpmn.mjs --dir=<plan_dir>
```

Relay every `PASS` / `REVIEW` / `FAIL` line.

## Exit Code Interpretation

| Exit | Status | Action |
|---|---|---|
| `0` | PASS | Return success |
| `1` | FAIL — schema, semantic, or BPMN parse error | Return every FAIL line. Parent fixes `bpmn.json` and re-generates |
| `2` | REVIEW — quality warnings | Return all warnings |

## Rules

- Read-only — never modify `bpmn.json` or `bpmn.bpmn`.
- Report ALL errors/warnings, not just the first.
- Never hand-edit `bpmn.bpmn` to pass — fix `bpmn.json` and re-render.
