---
name: opscale-bpmn
description: >
  Generates a BPMN 2.0 XML process file from the spec and DBML. Step 3 of
  Plan — runs after opscale-dbml, before opscale-sipoc. Trigger: "generate the
  BPMN", "map the process", "define the flow", "create the process diagram".
  Use it whenever the process flow needs to be defined as BPMN, even if phrased loosely. Don't use it to model data (opscale-dbml) or detail action internals (opscale-sipoc).
---

# opscale-bpmn

## Context

### Purpose

Model a **whole module** as one connected process and capture it as a schema-validated **`docs/plan/bpmn.json`** — the source of truth. The diagram **`docs/plan/bpmn.bpmn`** (raw BPMN 2.0 XML) is a **deterministic projection** of that JSON (never hand-edited): it is produced by `bpmn-moddle` and loads directly in Camunda Modeler or bpmn.io. `bpmn.json` is also the downstream handoff consumed by `opscale-sipoc` and `opscale-graph`, so its shape is a hard contract.

The BPMN authoritatively records **what gets implemented** — every operation maps to a class at Generate time. Each subprocess renders as one **expandable `<bpmn:subProcess>`** container (isExpanded=true) holding its operations as flow nodes: `crud → serviceTask`, `logic → businessRuleTask`. Every node carries a `<bpmn:documentation>` JSON with its metadata (type, code, entity/action or id, step, subprocess name, rules, operations) so the XML is self-contained.

### The JSON contract

`bpmn.json` is validated against `schema/bpmn.schema.json` (which `$ref`s the shared `common.schema.json`). The schema is a hard gate. Shape:

```jsonc
{
  "operations": {                        // NESTED MAP: subprocess code → step code → ordered op array.
    "SP-01": {                           //   both keys are REFERENCES to process.json — names are NOT reproduced here
      "SP-01-01": [                      // FIRST LEVEL: type ∈ {crud, logic} ONLY — never output
        { "code": "SP-01-01-C01", "position": 1, "type": "crud",
          "entity": "<entitySlug>", "action": "create|read|update|delete", "description": "...",
          "iterative": false, "iterationNote": "...",   // iterationNote REQUIRED when iterative=true
          "repeatReason": "..." }                         // REQUIRED when the same entity+action appears in >1 operation
      ],
      "SP-01-02": [
        { "code": "SP-01-02-L01", "position": 1, "type": "logic",   // position restarts at 1 in each step array
          "id": "<logicId: verb-noun, 2–3 words>", "rules": ["BR-01"], "description": "...",   // rules MAY be []
          "operations": [                // child operations: crud | logic | output
            { "code": "SP-01-02-L01-C01", "type": "crud", "entity": "...", "action": "create|read|update|delete", "description": "..." },
            { "code": "SP-01-02-L01-L01", "type": "logic", "ref": "<logicId defined at first level>", "description": "..." },
            { "code": "SP-01-02-L01-O01", "type": "output", "content": "...", "description": "..." }
          ] }
      ]
    }
  },
  "gateways": [ { "id": "pursue", "step": "SP-01-02", "question": "¿…?", "branches": [ { "label": "...", "to": "<code>" } ] } ],
  "events": [ { "type": "start|end|catch", "subprocess": "SP-01", "name": "..." } ]   // catch = a subprocess-closing wait
}
```

Enforced by the schema: `operations` is a nested map whose keys (subprocess `SP-XX`, step `SP-XX-YY`) reference `process.json` — the subprocesses are **not** reproduced here; first-level operation `type` is `crud` or `logic` **only** (an Output is never standalone); a **composed crud `action` is `create|read|update|delete`** (a Logic may create / read / update / delete entities and output); `logic.id` is `verb-noun` (2 words, 3 only when the noun is compound); `code` matches `SP-XX-YY-[C|L]ZZ` at first level and the nested `…-[C|L|O]AA` form when composed; `position` is an integer ≥ 1 that restarts per step and equals the 1-based array index; crud requires `entity`+`action`; logic requires `id`+`rules`+`operations` (its child-operations array). `rules` MAY be empty (`[]`) — business rules are numbered later by `opscale-sipoc`.

### Prerequisites — MUST be satisfied (ordered)

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-process` ran for this module | `docs/plan/process.json` PASSes | Stop. Run `/opscale-process`. |
| 2 | `opscale-dbml` ran for this module | `docs/plan/dbml.dbml` exists and PASSes | Stop. Run `/opscale-dbml`. |

Step 3 of the Plan phase (`process → dbml → bpmn → sipoc → ontology`), strictly ordered.

### Modes

- **Writable project folder:** write `docs/plan/bpmn.json` and render `docs/plan/bpmn.bpmn` directly.
- **Chat-only session:** produce the same files as downloadable outputs, each labeled with its destination path.

The agent-run validation gate is mandatory in both. The skill resolves its tooling (`bpmn-moddle`, `ajv`) from the shared `plan-contract` bundle — no install, ever.

### How this skill runs — context, per-subprocess interview, generate, validate

Nothing is generated until every piece is confirmed, and nothing advances past a phase whose gate has not passed. Heavy, non-interactive work is delegated to sub-agents; only the interview stays in the main conversation:

- **Phase 0 — Load context (agent).** Read `docs/plan/` and the modeling standard from `dbml.dbml`.
- **Phase 1 — Reconcile subprocesses (main conversation).** Contrast the as-is `process.json` subprocesses against the chosen modeling standard; add/drop/merge/split/rename. Ends in approval.
- **Phase 2 — Walk each subprocess, one at a time (main conversation).** For each: 2.1 elicit rules → 2.2 atomic operation sequence → 2.3 group CRUDs into Logics → 2.4 detailed recap. Each sub-phase ends in a gate.
- **Phase 3 — Consolidated summary (main conversation).** Present the whole flow before generating.
- **Phase 4 — Generate (agent).** Author `bpmn.json`, run `render-bpmn.mjs` to project `bpmn.bpmn`.
- **Phase 5 — Validate (agent).** Run `validate-bpmn.mjs`. Fix the JSON and re-render on failure — never hand-edit the XML.

### Language rule — structural keys English, content in the user's language

JSON keys, codes, `logic.id`, and `entity` slugs are canonical English/ASCII. Everything a stakeholder reads — `description`, gateway `question`, event/branch `name`, Output `content`, rule prose — follows the input language.

### The five operation categories

Operations are the atomic, technical level a business step decomposes into. **Only CRUD and Logic are standalone first-level operations.** Output is always composed inside a Logic; Event and Gateway are flow structure.

| Category | bpmn.json | BPMN element | What it is |
|---|---|---|---|
| **CRUD** | first-level `type:"crud"` | `serviceTask` | A single create/read/update/delete on one entity. No rules, no orchestration. |
| **Logic** | first-level `type:"logic"` | `businessRuleTask` | An orchestrated bundle of CRUDs (+ its Outputs) driven by a business rule — sometimes plus an external lookup, approval, or calculation. A Logic with zero composed CRUDs is suspicious. |
| **Output** | composed `type:"output"` | — (no node) | Something that leaves the system (notification, document, webhook). **Always inside the Logic that dispatches it** — never standalone, never a `sendTask`. Records only WHAT leaves (`content`); the channel is a Generate-phase decision. |
| **Event** | `events[]` | `startEvent` / `endEvent` / `intermediateCatchEvent` | start/end bound the process; each `catch` is a subprocess-closing wait (the spec's `endsWith`). |
| **Gateway** | `gateways[]` | `exclusiveGateway` | A branch on a condition; each branch targets an operation `code`. |

**Forbidden node types:** `userTask`, `manualTask`, `receiveTask`, `scriptTask`, `callActivity`, `sendTask`.

#### Key modeling rules (preserved from the semantic playbook)

- **Create inside a Logic is allowed.** A composed crud may be `create`, `read`, `update`, or `delete`. A Logic may create an entity as part of its orchestration (as well as read/update/delete around it). (Schema-enforced.)
- **Logic = orchestrated CRUDs.** The classic shape is a guarded state transition: a record moves A→B only by also reading X, validating Y, updating Z. A standalone `update {entity}.status` on a lifecycle entity is a red flag — it belongs inside a Logic (the transition guard).
- **Approvals are two-outcome.** A formal go/no-go implies both the approving Logic and its rejecting counterpart (`approve-x` / `reject-x`), separated by the gateway that carries the decision. Any acceptance the flow waits on can be declined — model the branch.
- **Outputs are never loose.** A notification/document/webhook is the effect of a rule resolving; it attaches to the Logic whose outcome it communicates. If an Output has no Logic to attach to, the underlying state change is probably a loose CRUD that should be a Logic — surface the gap, don't emit a standalone output.
- **Reuse is by reference.** A Logic the flow invokes elsewhere appears once at first level; other Logics reference it via a composed `{type:"logic","ref":"…"}` member (nested code `…-LAA`). The reference is never re-expanded and keeps its own SIPOC.
- **Simple queries are crud reads** (`serviceTask`), never a `businessRuleTask`.
- **Every crud `entity`** is a DBML entity slug. If one is missing from `docs/plan/dbml.dbml`, stop and fix the DBML first.

### Output

```
docs/plan/
├── bpmn.json        # validated source of truth (subprocesses → operations → each logic's operations)
└── bpmn.bpmn        # deterministic projection: BPMN 2.0 XML, one expandable subProcess per subprocess
```

`bpmn.json` is the handoff to `opscale-sipoc` (one SIPOC per first-level Logic) and `opscale-graph`.

## Steps

### Phase 0 — Load context (agent)

Read `docs/plan/process.json`, `docs/plan/dbml.dbml` (table names + the modeling standard recorded in the Project `Note:`), and any existing `bpmn.json`. Return a compact summary.

### Phase 1 — Reconcile subprocesses (authorization gate)

`process.json` captured the subprocesses as the area runs **today**. The BPMN models the **to-be systematized** version aligned to the modeling standard chosen in `opscale-dbml` Phase 1. Contrast each as-is subprocess against the standard and decide keep / rename / merge / split / drop / add — **ask** on every change. Present the reconciled list, the dropped as-is artifacts, and the DBML entities available. If you amend the spec, update `docs/plan/process.json` and re-run its gate so the two never disagree.

**Wait for user approval before continuing.**

### Phase 2 — Walk each approved subprocess (one at a time): rules → atomic → grouped → recap

For **each** subprocess, in order:

- **2.1 Elicit business rules.** Status transitions that aren't free, external lookups that must succeed, approvals, calculations across entities, sequencing requirements, side effects that must accompany an action. The rules reveal where Logics live. Each rule becomes a `BR-NN` entry (numbered later by `opscale-sipoc`; reference them as `rules:["BR-01"]`).
- **2.2 Atomic operation sequence (no Logic yet).** Walk the subprocess's steps from `process.json`; decompose each into atomic CRUD / Output / Event / Gateway, each shown individually, grouped under its step. Every crud entity must exist in `dbml.dbml`.
- **2.3 Group CRUDs into Logics.** Collapse contiguous CRUDs (optionally with a lookup/approval/calculation) into named Logics (`verb-noun`). A Logic absorbs its create/read/update/delete CRUDs and its Outputs. Every lifecycle `update status` ends up inside a Logic. Preserve 2.2's order.
- **2.4 Detailed recap.** Expand to the full per-operation detail the JSON needs: first-level operations (crud + logic) with positions, each Logic's `rules` + `operations` (crud/logic-ref/output), the gateways (question + branches to codes), and the subprocess-closing wait. Once confirmed, the subprocess is locked.

Each sub-phase ends in a confirmation gate. **Do not skip ahead to generation while any subprocess is unwalked.**

### Phase 3 — Consolidated summary

Present the whole flow: subprocesses, all first-level operations (crud + logic with ids), composed Outputs under their Logics, gateways, start/catch/end events, and the DBML entities used. **Never generate without explicit confirmation.**

### Phase 4 — Generate (agent)

Author `docs/plan/bpmn.json` from the locked structure and run:

```bash
node scripts/render-bpmn.mjs --dir=docs/plan
```

It validates the JSON (schema + semantic rules) and projects `docs/plan/bpmn.bpmn` with `bpmn-moddle`. Replace existing files.

### Phase 5 — Validate (agent)

```bash
node scripts/validate-bpmn.mjs --dir=docs/plan
```

It runs schema + semantic checks, re-renders in memory, **re-imports the rendered XML through `bpmn-moddle`** (a parse error ⇒ FAIL), confirms the XML contains the expandable `<bpmn:subProcess>` containers, and confirms the on-disk `bpmn.bpmn` matches the projection. Exit 0 = pass, 1 = fail, 2 = review. On failure, fix `bpmn.json` and re-render — never hand-edit the XML.

## Layout note (deviation)

`bpmn-auto-layout` renders a `subProcess` as a collapsed box with a separate drill-down plane; it does not lay out an expanded container with nested children. Because the contract requires **expandable** containers, the renderer computes the DI itself (one plane; each subProcess shape `isExpanded=true` and sized to enclose its children). BPMN forbids a sequence flow crossing a subProcess boundary, so a **gateway branch whose target lives in another subprocess** is routed to that subprocess's own end event with the target code preserved in the flow label.

## Success condition

```bash
node scripts/validate-bpmn.mjs --dir=docs/plan
```

Exit code 0 = pass (1 = fail, 2 = review warnings).
