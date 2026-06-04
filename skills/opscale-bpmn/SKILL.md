---
name: opscale-bpmn
description: >
  Generates a BPMN 2.0 XML process file from the spec and DBML. Step 3 of
  Plan — runs after opscale-dbml, before opscale-sipoc. Trigger: "generate the
  BPMN", "map the process", "define the flow", "create the process diagram".
  Use it whenever the process flow needs to be defined as BPMN, even if phrased loosely. Don't use it to model data (opscale-dbml) or detail action internals (opscale-sipoc).
---

# opscale-bpmn

## Purpose

Transform a validated spec and DBML into a BPMN 2.0 XML file that maps the business
process to executable Opscale operations. The BPMN is the authoritative source for
what gets implemented — every task maps directly to a class.

Output is written to `.specify/specs/{NNN}-{module-name}/process.md`.

---

## Prerequisites — MUST be satisfied (ordered)

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init` first. |
| 2 | `opscale-process` has been run for this module | `.specify/specs/{NNN}-{module-name}/spec.md` exists and PASS | Stop. Run `/opscale-process` first. |
| 3 | `opscale-dbml` has been run for this module | `.specify/specs/{NNN}-{module-name}/data-model.md` exists and PASS | Stop. Run `/opscale-dbml` first. |

This skill is **Step 3 (last) of the Plan phase**. The Plan phase is `process → dbml → bpmn` — strictly ordered, no skipping. After this skill passes, the module enters the Generate phase (`domain → ui → logic`).

---

## Opscale Task Types

Only two task types are allowed. Everything else is forbidden.

### serviceTask — `crud`
Persistence and query operations on domain entities via their Repository.
No business logic. No conditions. No transformations. Always a `serviceTask`.

```xml
<bpmn:serviceTask id="service_[id]" name="[Verb Entity]">
  <bpmn:documentation>{"type":"crud","entity":"[dbml_table_name]","action":"[create|read|update|delete]"}</bpmn:documentation>
  <bpmn:incoming>flow_[id]</bpmn:incoming>
  <bpmn:outgoing>flow_[id]</bpmn:outgoing>
</bpmn:serviceTask>
```

| action | Use for |
|--------|---------|
| `create` | Insert a new record |
| `read` | Query or retrieve data |
| `update` | Modify an existing record |
| `delete` | Remove a record |

**Simple queries always use `serviceTask` with `action: "read"` and `type: "crud"` — never `businessRuleTask`.**

---

### businessRuleTask — `logic`
Encapsulated business operation — applies rules, validates conditions, calculates values,
or coordinates multiple entities. Maps to exactly one Opscale Action class.
Name the task as the Action class name in PascalCase verb+noun form.

```xml
<bpmn:businessRuleTask id="rule_[id]" name="[ActionClassName]">
  <bpmn:documentation>{"type":"logic","id":"[kebab-case-id]"}</bpmn:documentation>
  <bpmn:incoming>flow_[id]</bpmn:incoming>
  <bpmn:outgoing>flow_[id]</bpmn:outgoing>
</bpmn:businessRuleTask>
```

### sendTask — `output`
Dispatches something that leaves the system — email, push notification, PDF, SMS,
WhatsApp, webhook. Maps to exactly one Output class. One channel per task.

```xml
<bpmn:sendTask id="send_[id]" name="[Send description]">
  <bpmn:documentation>{"type":"output","channel":"[email|push|sms|whatsapp|pdf|webhook|dashboard]","trigger":"[kebab-case-action-id]"}</bpmn:documentation>
  <bpmn:incoming>flow_[id]</bpmn:incoming>
  <bpmn:outgoing>flow_[id]</bpmn:outgoing>
</bpmn:sendTask>
```

| Use businessRuleTask for | Use serviceTask (crud) for |
|-------------------------|---------------------------|
| Calculate totals, apply discounts | Get customer data |
| Validate business rules | Query product list |
| Generate sequential numbers | Read configuration |
| Apply complex transformations | Search records, simple lookups |

| Use sendTask for |
|-----------------|
| Send email, push, SMS, WhatsApp |
| Generate and deliver PDF reports |
| Call external webhooks |

---

### Forbidden task types
`userTask` · `manualTask` · `receiveTask` · `scriptTask` · `callActivity` · `subProcess`

---

## Allowed BPMN Elements

| Category | Elements |
|----------|----------|
| Tasks | `serviceTask` (crud), `businessRuleTask` (logic), `sendTask` (output) |
| Gateways | `exclusiveGateway`, `parallelGateway`, `inclusiveGateway`, `eventBasedGateway` |
| Events | `startEvent`, `endEvent`, `intermediateCatchEvent`, `intermediateThrowEvent` |
| Flows | `sequenceFlow`, `messageFlow` |

---

## Workflow

### Phase 1 — Parse DBML entities

Read `data-model.md` and extract all table names. These are the only valid entity values
for `scriptTask`. Present and confirm:

```
DBML entities detected:
- [table_1]
- [table_2]
- [table_n]

Is the DBML complete or is any entity missing?
```

Wait for confirmation before continuing.

---

### Phase 2 — Analyze current vs systematized process

Read `spec.md` Actions section. The spec describes the systematized process.
For each action, identify: what it does, who does it, what data it touches.
This is the input for Phase 3.

---

### Phase 3 — Classify each activity

For **each action** in the spec, ask for classification — one at a time:

> "Is '[Activity]' CRUD (create/read/update/delete a record) or business logic
> (calculation, validation, notification, integration that modifies state)?"

**If CRUD:**
- Ask: which entity? (must exist in DBML list)
- Ask: which action — create, read, update, or delete?
- Confirm before moving on

**If Logic:**
- Verify it actually modifies state/data — if it's a simple query, reclassify as CRUD read
- Propose ID in kebab-case
- Confirm before moving on

Present per activity:

```
Activity: "[name]"
→ Type: [CRUD | Logic]
→ Task: [serviceTask | businessRuleTask | sendTask]
→ [entity + action | operation id]

Correct?
```

Wait for confirmation after each activity.

---

### Phase 4 — Confirm all operations

List all `serviceTask` operations identified:

```
Logic operations defined:

1. `[operation-id-1]` — "[Descriptive name]"
2. `[operation-id-2]` — "[Descriptive name]"

All modify state/data. Complete or any missing?
```

Wait for confirmation.

---

### Phase 5 — Final summary before generating

```
Summary before generating BPMN:

CRUD (serviceTask):
- [entity] → [action]

Logic (businessRuleTask):
- `[kebab-case-id]` → [description]

Output (sendTask):
- `[channel]` triggered by `[logic-id]`

Flow:
- Start: [trigger from spec]
- Gateways: [list]
- End: [post-conditions from spec]

DBML entities used: [list]

Generate BPMN file?
```

Never generate without explicit confirmation.

---

### Phase 6 — Assemble and validate

Assemble the complete BPMN 2.0 XML in memory — **do not write the file yet**.

The validator accepts EITHER a raw `.bpmn` file OR a markdown file that wraps
the XML in a ```` ```xml ... ``` ```` fenced block (which is exactly what
`process.md` looks like). Either form works:

```bash
# bpmn-moddle is already bundled in this skill's node_modules — no install needed

# Option A — validate the assembled process.md directly (recommended)
node {SKILL_DIR}/opscale-bpmn/scripts/validate-bpmn.mjs /tmp/.process.tmp.md

# Option B — write the raw XML to a .bpmn temp file and validate that
cat > /tmp/.bpmn-validate.tmp.bpmn << 'TMPEOF'
[assembled BPMN XML]
TMPEOF
node {SKILL_DIR}/opscale-bpmn/scripts/validate-bpmn.mjs /tmp/.bpmn-validate.tmp.bpmn
```

**exit 1** — XML/BPMN structure error: fix and re-run.
**exit 2** — Quality warnings (forbidden task types, missing docs, unlabelled
gateway branches, orphan tasks, missing start/end events): fix and re-run.
**exit 0** — Proceed to Phase 7.

The script never gets copied to the project — it stays in the skill bundle.

---

### Phase 7 — Write output and close gate

Only reached after validator exits with `0`.

Write the live process map to:
```
.specify/specs/{NNN}-{module-name}/process.md
```

**Also write the frozen initial snapshot — first run only:**

```bash
# Extract the raw BPMN XML (the ```xml ... ``` fenced section) from the
# assembled process.md and write it to docs/initial.bpmn — ONLY if the file
# does not already exist.
mkdir -p .specify/specs/{NNN}-{module-name}/docs
[ -f .specify/specs/{NNN}-{module-name}/docs/initial.bpmn ] \
  || cp /tmp/.bpmn-extracted.bpmn .specify/specs/{NNN}-{module-name}/docs/initial.bpmn
```

**Two artifacts, two purposes:**
- `process.md` — the **live** process map. Evolves with every iteration that
  changes the flow; downstream skills (logic, outputs, test) read from here.
- `docs/initial.bpmn` — the **frozen** BPMN snapshot captured the very first
  time this skill runs. Pure XML, no markdown wrapper. Never modified by
  future iterations — used to diff the flow against its original design.

If `docs/initial.bpmn` already exists, leave it alone.

Deliver summary:

```
✅ BPMN file generated.

Content:
- [n] scriptTask (CRUD)
- [n] serviceTask (Logic)
- [n] gateways

CRUD entities used: [list]
Operations defined: [list]

Validation: open https://demo.bpmn.io → File → Open → select the .bpmn block

Need adjustments?
```

Then verify the semantic gate:

```
BPMN COMPLETENESS GATE
──────────────────────────────────────────────────────
[ ] Script exited with code 0
[ ] process.md written
[ ] docs/initial.bpmn written on first run (or preserved if already present)
[ ] Only serviceTask, businessRuleTask, sendTask used — no scriptTask
[ ] Every crud serviceTask entity exists in data-model.md
[ ] Every crud serviceTask has valid action (create|read|update|delete)
[ ] Every businessRuleTask has a logic id in kebab-case
[ ] Every sendTask has channel and trigger attributes
[ ] Simple queries use serviceTask (crud read) — not businessRuleTask
[ ] Every gateway branch has a condition label
[ ] Start event and at least one end event present
[ ] Every task has incoming and outgoing flows
[ ] No orphaned elements
[ ] Complete BPMNDiagram section with shapes and edges
──────────────────────────────────────────────────────
STATUS: [ ] PASS — opscale-domain may proceed
        [ ] FAIL — list blocking items below
```

---

## Output: process.md

````markdown
# Process Map: [Module Name]

> Source: `.specify/specs/{NNN}-{module-name}/spec.md`
> Domain model: `.specify/specs/{NNN}-{module-name}/data-model.md`
> Subdomain: [slug]

---

## Task Summary

| ID | Name | Type | Task | Entity / ID | Action |
|----|------|------|------|-------------|--------|
| service_01 | [name] | crud | serviceTask | [table_name] | create |
| rule_01 | [name] | logic | businessRuleTask | [kebab-case-id] | — |
| send_01 | [name] | output | sendTask | [channel] | trigger: [id] |

---

## BPMN 2.0

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_[module_slug]"
  targetNamespace="http://opscale.co/bpmn">

  <bpmn:process id="proc_[module_slug]" isExecutable="false">

    <!-- Start Event -->
    <bpmn:startEvent id="start_01" name="[Trigger from spec]">
      <bpmn:outgoing>flow_001</bpmn:outgoing>
    </bpmn:startEvent>

    <!-- CRUD Task -->
    <bpmn:serviceTask id="service_[id]" name="[Verb Entity]">
      <bpmn:documentation>{"type":"crud","entity":"[table_name]","action":"create"}</bpmn:documentation>
      <bpmn:incoming>flow_001</bpmn:incoming>
      <bpmn:outgoing>flow_002</bpmn:outgoing>
    </bpmn:serviceTask>

    <!-- Logic Task -->
    <bpmn:businessRuleTask id="rule_[id]" name="[ActionClassName]">
      <bpmn:documentation>{"type":"logic","id":"[kebab-case-id]"}</bpmn:documentation>
      <bpmn:incoming>flow_002</bpmn:incoming>
      <bpmn:outgoing>flow_003</bpmn:outgoing>
    </bpmn:businessRuleTask>

    <!-- Output Task -->
    <bpmn:sendTask id="send_[id]" name="[Send description]">
      <bpmn:documentation>{"type":"output","channel":"email","trigger":"[kebab-case-id]"}</bpmn:documentation>
      <bpmn:incoming>flow_003</bpmn:incoming>
      <bpmn:outgoing>flow_004</bpmn:outgoing>
    </bpmn:sendTask>

    <!-- Exclusive Gateway -->
    <bpmn:exclusiveGateway id="gateway_[id]" name="[Condition?]">
      <bpmn:incoming>flow_003</bpmn:incoming>
      <bpmn:outgoing>flow_004</bpmn:outgoing>
      <bpmn:outgoing>flow_005</bpmn:outgoing>
    </bpmn:exclusiveGateway>

    <!-- End Events -->
    <bpmn:endEvent id="end_[id]" name="[Post-condition from spec]">
      <bpmn:incoming>flow_004</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="end_[id2]" name="[Alternative end]">
      <bpmn:incoming>flow_005</bpmn:incoming>
    </bpmn:endEvent>

    <!-- Sequence Flows -->
    <bpmn:sequenceFlow id="flow_001" sourceRef="start_01" targetRef="script_[id]"/>
    <bpmn:sequenceFlow id="flow_002" sourceRef="script_[id]" targetRef="service_[id]"/>
    <bpmn:sequenceFlow id="flow_003" sourceRef="service_[id]" targetRef="gateway_[id]"/>
    <bpmn:sequenceFlow id="flow_004" name="[condition true]"  sourceRef="gateway_[id]" targetRef="end_[id]"/>
    <bpmn:sequenceFlow id="flow_005" name="[condition false]" sourceRef="gateway_[id]" targetRef="end_[id2]"/>

  </bpmn:process>

  <!-- BPMNDiagram (mandatory — required for bpmn.io import) -->
  <bpmndi:BPMNDiagram id="diagram_[module_slug]">
    <bpmndi:BPMNPlane bpmnElement="proc_[module_slug]">

      <bpmndi:BPMNShape bpmnElement="start_01" id="shape_start_01">
        <dc:Bounds x="100" y="200" width="36" height="36"/>
      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape bpmnElement="script_[id]" id="shape_script_[id]">
        <dc:Bounds x="180" y="178" width="100" height="80"/>
      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape bpmnElement="service_[id]" id="shape_service_[id]">
        <dc:Bounds x="330" y="178" width="100" height="80"/>
      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape bpmnElement="gateway_[id]" id="shape_gw_[id]">
        <dc:Bounds x="480" y="193" width="50" height="50"/>
      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape bpmnElement="end_[id]" id="shape_end_[id]">
        <dc:Bounds x="580" y="200" width="36" height="36"/>
      </bpmndi:BPMNShape>

      <bpmndi:BPMNEdge bpmnElement="flow_001" id="edge_001">
        <di:waypoint x="136" y="218"/>
        <di:waypoint x="180" y="218"/>
      </bpmndi:BPMNEdge>

      <!-- repeat for all edges -->

    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>

</bpmn:definitions>
```
````

---

## Layout Rules

| Element | Width | Height |
|---------|-------|--------|
| Start/End Event | 36 | 36 |
| scriptTask | 100 | 80 |
| serviceTask | 100 | 80 |
| Gateway | 50 | 50 |
| Lane | variable | 150+ |

- **Initial coordinates:** x=100, y=100
- **Horizontal spacing:** 150 units minimum between elements
- **Vertical spacing:** 100 units minimum between parallel paths
- **Flow direction:** Left to right

---

## ID Conventions

| Element | Prefix | Example |
|---------|--------|---------|
| Process | `proc_` | `proc_loan_management` |
| Start event | `start_` | `start_application_received` |
| End event | `end_` | `end_loan_approved` |
| serviceTask (crud) | `service_` | `service_create_application` |
| businessRuleTask (logic) | `rule_` | `rule_calculate_interest` |
| sendTask (output) | `send_` | `send_approval_notification` |
| Gateway | `gateway_` | `gateway_credit_check` |
| Sequence flow | `flow_` | `flow_001` |
| Lane | `lane_` | `lane_analyst` |
| Shape | `shape_` | `shape_script_create_application` |
| Edge | `edge_` | `edge_001` |
