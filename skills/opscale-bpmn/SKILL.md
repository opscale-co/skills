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

This skill is **Step 3 of the Plan phase**. The Plan phase is `process → dbml → bpmn → sipoc` — strictly ordered, no skipping. After `opscale-sipoc`, the module enters the Generate phase (`domain → ui → logic`).

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
Encapsulated business operation — anything **heavier than a single CRUD**. A step is `logic` when it does one or more of:
- queries an **external source** (API, external DB, third-party service) to proceed,
- requires an **approval** by an authorized role,
- **gathers additional data** before it can continue,
- **calculates / transforms** with formulas or business rules,
- **coordinates multiple entities**.

If a step is a plain create/read/update/delete on one entity, it is `serviceTask` (crud), not logic. Maps to exactly one Opscale Action class.

**Naming — MANDATORY: `verb + noun` in natural language.** The `name` attribute is a short human-readable phrase — verb first, noun next, sentence case, spaces between words. No PascalCase, no class-name form, no abbreviations. Examples: `"Calculate interest"`, `"Approve loan"`, `"Validate credit score"`, `"Generate sequential number"`. The `id` inside `<documentation>` is the kebab-case slug derived from that phrase (`calculate-interest`, `approve-loan`, …) — downstream skills derive the Action class name from this slug.

```xml
<bpmn:businessRuleTask id="rule_[id]" name="[Verb noun in natural language]">
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
`userTask` · `manualTask` · `receiveTask` · `scriptTask` · `callActivity`

---

## Mapping the module spec to BPMN

`opscale-process` already produced the typed flow. Translate each step emoji directly:

| Spec step | BPMN element |
|---|---|
| 📝 record | `serviceTask` (`type=crud`) |
| ⚙️ logic | `businessRuleTask` (`type=logic`) |
| ✅ approval | `businessRuleTask` (`type=logic`) |
| 📩 / 📄 output | `sendTask` (`type=output`) |
| ⏳ wait | `intermediateCatchEvent` |
| 🔀 decision | `exclusiveGateway` |

**One `subProcess` per identified process.** The spec's **Procesos identificados** lists the sub-processes inside the module's macro-flow. Wrap each one in an embedded `subProcess` so the top-level diagram stays legible — the main flow reads as a sequence of named sub-processes, and the detailed steps live inside each. Model the **whole module**, not a single process.

## Allowed BPMN Elements

| Category | Elements |
|----------|----------|
| Tasks | `serviceTask` (crud), `businessRuleTask` (logic), `sendTask` (output) |
| Structure | `subProcess` — one per process in the spec's **Procesos identificados** |
| Gateways | `exclusiveGateway`, `parallelGateway`, `inclusiveGateway`, `eventBasedGateway` |
| Events | `startEvent`, `endEvent`, `intermediateCatchEvent`, `intermediateThrowEvent` |
| Flows | `sequenceFlow`, `messageFlow` |

---

## Workflow

The workflow is strictly sequential: **flows → steps per flow → BPMN**. Do not attempt to classify a single step before the user has approved (a) the list of flows and (b) the step list for the flow that step belongs to. Never generate the BPMN until every flow has been walked.

### Phase 1 — Parse inputs and list detected flows

Read both inputs:
- `spec.md` → the **Procesos identificados** section (one `subProcess` each) and the typed steps under each flow.
- `data-model.md` → all table names. These are the only valid `entity` values for `serviceTask` (crud).

Present the **list of detected flows** first — nothing else — and wait for approval:

```
Flows detected in spec.md *Procesos identificados*:

1. [Flow 1 name] — [one-line purpose from spec]
2. [Flow 2 name] — [one-line purpose from spec]
3. [Flow n name] — [one-line purpose from spec]

DBML entities available: [comma-separated table list]

Is this the complete set of flows? Any missing, extra, or to rename?
```

Wait for explicit approval of the flow list. If the user adds, removes or renames flows, update spec.md *Procesos identificados* accordingly before continuing. **Do not move to Phase 2 until the flow list is locked.**

---

### Phase 2 — Walk each approved flow, list its steps, classify

For **each approved flow, in order**, do a full pass before moving to the next one. Per flow:

**2a. List the steps**

Read the flow's typed steps from spec.md and present them as-is:

```
Flow [n]: "[Flow name]"

Steps:
1. [emoji] [step name from spec]
2. [emoji] [step name from spec]
3. ...

Is this step list complete? Any missing, extra, or reordered?
```

Wait for approval. **Do not classify until the step list is approved.**

**2b. Classify each step**

Once the step list is approved, walk every step and propose a classification. Translate the spec emoji directly:

| Spec step | BPMN element | Naming format for `name` attribute |
|---|---|---|
| 📝 record | `serviceTask` (crud) | `"[Verb] [entity]"` — e.g. `"Create application"` |
| ⚙️ logic | `businessRuleTask` (logic) | **`verb + noun` natural language** — e.g. `"Calculate interest"` |
| ✅ approval | `businessRuleTask` (logic) | **`verb + noun` natural language** — e.g. `"Approve loan"` |
| 📩 / 📄 output | `sendTask` (output) | `"Send [thing] via [channel]"` |
| ⏳ wait | `intermediateCatchEvent` | `"Wait for [condition]"` |
| 🔀 decision | `exclusiveGateway` | `"[Condition?]"` |

Present per step:

```
Step: "[name from spec]"
→ Type: [CRUD | Logic | Output | Wait | Decision]
→ Task: [serviceTask | businessRuleTask | sendTask | intermediateCatchEvent | exclusiveGateway]
→ Name: "[verb + noun in natural language]"   ← for logic/output
→ [entity + action]                            ← for CRUD
→ Logic id (kebab-case): "[verb-noun]"         ← for logic (auto-derived from Name)

Correct?
```

Rules during classification:
- **If CRUD**: the `entity` MUST exist in the DBML table list. If it doesn't, stop and have the user fix the DBML first.
- **If Logic**: the `name` MUST be `verb + noun` in natural language (sentence case, spaces, no PascalCase, no abbreviations). The `id` is the kebab-case slug of that name (`calculate-interest`). If the proposed step is actually a plain create/read/update/delete on one entity, reclassify as CRUD — do not promote queries to logic.
- **If Output**: ask which channel (`email | push | sms | whatsapp | pdf | webhook | dashboard`) and which logic step triggers it.

Wait for confirmation after each step.

**2c. Flow recap**

Once every step in the flow is classified, recap the flow before moving on:

```
Flow [n] "[Flow name]" — locked:

Steps (in order):
1. [task type] "[name]"     ← [entity+action | logic-id | channel]
2. ...

CRUD entities touched: [list]
Logic operations: [list of verb+noun names]
Outputs: [list]
Gateways: [list with branch labels]

Move to next flow?
```

Wait for confirmation. Then repeat 2a–2c for the next approved flow. **Do not skip ahead to the BPMN while any flow is still unwalked.**

---

### Phase 3 — Final summary before generating

After every flow has been locked, present the consolidated summary:

```
Summary before generating BPMN:

Flows (one subProcess each):
- [Flow 1] → [n steps]
- [Flow 2] → [n steps]

CRUD (serviceTask):
- [entity] → [action]   (in flow: [flow name])

Logic (businessRuleTask) — verb + noun, natural language:
- "[Verb noun]" (id: `[verb-noun]`)   (in flow: [flow name])

Output (sendTask):
- `[channel]` triggered by `[logic-id]`   (in flow: [flow name])

Flow (top level):
- Start: [trigger from spec]
- Gateways: [list]
- End: [post-conditions from spec]

DBML entities used: [list]

Generate BPMN file?
```

Never generate without explicit confirmation.

---

### Phase 4 — Assemble and validate

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
**exit 0** — Proceed to Phase 5.

The script never gets copied to the project — it stays in the skill bundle.

---

### Phase 5 — Write output and close gate

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
[ ] Flow list approved before any step classification began
[ ] Every flow walked: step list approved, then each step classified
[ ] Script exited with code 0
[ ] process.md written
[ ] docs/initial.bpmn written on first run (or preserved if already present)
[ ] One subProcess per flow in spec.md *Procesos identificados*
[ ] Only serviceTask, businessRuleTask, sendTask used — no scriptTask
[ ] Every crud serviceTask entity exists in data-model.md
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
| service_01 | Create application | crud | serviceTask | [table_name] | create |
| rule_01 | Calculate interest (verb + noun, natural language) | logic | businessRuleTask | calculate-interest | — |
| send_01 | Send approval notification | output | sendTask | email | trigger: approve-loan |

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

    <!-- Logic Task — name MUST be verb + noun in natural language (e.g. "Calculate interest") -->
    <bpmn:businessRuleTask id="rule_[id]" name="Calculate interest">
      <bpmn:documentation>{"type":"logic","id":"calculate-interest"}</bpmn:documentation>
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
