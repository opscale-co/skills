# BPMN XML templates — verbatim reference

These are the canonical XML snippets the skill assembles. Names follow Opscale conventions: `verb + noun` in natural language for `businessRuleTask`, kebab-case `id` inside `<documentation>`.

**The XML is self-contained.** Every task's `<documentation>` JSON carries the full metadata a consumer needs — business step, subprocess, and (for Logics) governing rules and composed CRUDs/Outputs. Rules for the JSON:

- **Only two node types**: `serviceTask` (standalone crud) and `businessRuleTask` (logic). There is **no `sendTask`** — Outputs are composed members of a Logic, never nodes.
- **Key order is fixed**: `type` first, then `oid`, then `id` (logic) / `entity` (crud) — downstream regex parsers rely on it.
- **`oid` is the operation's ontology id**: `SP-XX-YY-[C|L|O]ZZ` (subprocess XX, local step YY, category letter, ZZ counting per category within the step). Composed CRUDs and Outputs inside a Logic carry the nested form `SP-XX-YY-LZZ-[C|L|O]AA`. Oids are unique across the module (a reused Logic node repeats its oid together with its identical JSON).
- A Logic id reused by several nodes carries **identical JSON in every node** (the validator checks consistency).
- Free prose (`rules`, `step`, Output `content`) must not contain raw `<` or `&` — rephrase or escape (`&lt;`, `&amp;`).
- The `<bpmn:process>` element opens with its own `<bpmn:documentation>` carrying `{"module":"…","standard":"…"}` (the modeling standard chosen in `opscale-dbml` Phase 1, `"none"` if none).

## Task type snippets

### serviceTask — `crud`

Persistence and query operations on domain entities. No business logic, no conditions, no transformations.

```xml
<bpmn:serviceTask id="service_[id]" name="[Verb Entity]">
  <bpmn:documentation>{"type":"crud","oid":"SP-XX-YY-CZZ","entity":"[dbml_table_name]","action":"[create|read|update|delete]","step":"[business step from process.txt]","subprocess":"[subprocess name]"}</bpmn:documentation>
  <bpmn:incoming>flow_[id]</bpmn:incoming>
  <bpmn:outgoing>flow_[id]</bpmn:outgoing>
</bpmn:serviceTask>
```

### businessRuleTask — `logic`

Encapsulated business operation. Name MUST be `verb + noun` in natural language (sentence case). The `id` inside `<documentation>` is the kebab-case slug.

The `composed` array mixes CRUD members `{"oid","entity","action"}` and **Output members `{"oid","content"}`** (no channel). An Output only ever appears here, inside the Logic that dispatches it — never as its own node.

```xml
<bpmn:businessRuleTask id="rule_[id]" name="[Verb noun in natural language]">
  <bpmn:documentation>{"type":"logic","oid":"SP-XX-YY-LZZ","id":"[kebab-case-id]","step":"[business step]","subprocess":"[subprocess name]","rules":["[governing rule in prose]"],"composed":[{"oid":"SP-XX-YY-LZZ-CAA","entity":"[table]","action":"[crud action]"},{"oid":"SP-XX-YY-LZZ-OAA","content":"[brief: what leaves the system]"}]}</bpmn:documentation>
  <bpmn:incoming>flow_[id]</bpmn:incoming>
  <bpmn:outgoing>flow_[id]</bpmn:outgoing>
</bpmn:businessRuleTask>
```

### output — composed member (no node)

An Output is never a node. It is a `{"oid":"SP-XX-YY-LZZ-OAA","content":"[brief: what leaves the system]"}` entry in the `composed` array of the Logic that dispatches it (see the `businessRuleTask` snippet above). The concrete channel is a Generate-phase decision — the Plan records only the brief `content`.

## Full `docs/plan/bpmn.bpmn` skeleton

Raw BPMN 2.0 XML — no markdown wrapper, no surrounding prose. Loadable directly in Camunda Modeler or bpmn.io.

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
    <bpmn:documentation>{"module":"[module-name]","standard":"[modeling standard or none]"}</bpmn:documentation>

    <!-- Start Event -->
    <bpmn:startEvent id="start_01" name="[Trigger from spec]">
      <bpmn:outgoing>flow_001</bpmn:outgoing>
    </bpmn:startEvent>

    <!-- CRUD Task -->
    <bpmn:serviceTask id="service_[id]" name="[Verb Entity]">
      <bpmn:documentation>{"type":"crud","oid":"SP-01-01-C01","entity":"[table_name]","action":"create","step":"[business step]","subprocess":"[subprocess name]"}</bpmn:documentation>
      <bpmn:incoming>flow_001</bpmn:incoming>
      <bpmn:outgoing>flow_002</bpmn:outgoing>
    </bpmn:serviceTask>

    <!-- Logic Task — name MUST be verb + noun in natural language (e.g. "Calculate interest") -->
    <bpmn:businessRuleTask id="rule_[id]" name="Calculate interest">
      <bpmn:documentation>{"type":"logic","oid":"SP-01-02-L01","id":"calculate-interest","step":"[business step]","subprocess":"[subprocess name]","rules":["interest applies only to approved loans"],"composed":[{"oid":"SP-01-02-L01-C01","entity":"loan","action":"read"},{"oid":"SP-01-02-L01-C02","entity":"interest","action":"create"}]}</bpmn:documentation>
      <bpmn:incoming>flow_002</bpmn:incoming>
      <bpmn:outgoing>flow_003</bpmn:outgoing>
    </bpmn:businessRuleTask>

    <!-- Exclusive Gateway -->
    <bpmn:exclusiveGateway id="gateway_[id]" name="[Condition?]">
      <bpmn:incoming>flow_003</bpmn:incoming>
      <bpmn:outgoing>flow_004</bpmn:outgoing>
      <bpmn:outgoing>flow_005</bpmn:outgoing>
    </bpmn:exclusiveGateway>

    <!-- Outputs are NOT nodes — the interest statement above is a composed
         member of the rule_[id] Logic (see its "composed" array). -->

    <!-- End Events -->
    <bpmn:endEvent id="end_[id]" name="[Post-condition from spec]">
      <bpmn:incoming>flow_004</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="end_[id2]" name="[Alternative end]">
      <bpmn:incoming>flow_005</bpmn:incoming>
    </bpmn:endEvent>

    <!-- Sequence Flows -->
    <bpmn:sequenceFlow id="flow_001" sourceRef="start_01" targetRef="service_[id]"/>
    <bpmn:sequenceFlow id="flow_002" sourceRef="service_[id]" targetRef="rule_[id]"/>
    <bpmn:sequenceFlow id="flow_003" sourceRef="rule_[id]" targetRef="gateway_[id]"/>
    <bpmn:sequenceFlow id="flow_004" name="[condition true]"  sourceRef="gateway_[id]" targetRef="end_[id]"/>
    <bpmn:sequenceFlow id="flow_005" name="[condition false]" sourceRef="gateway_[id]" targetRef="end_[id2]"/>

  </bpmn:process>

  <!-- BPMNDiagram (mandatory — required for bpmn.io import) -->
  <bpmndi:BPMNDiagram id="diagram_[module_slug]">
    <bpmndi:BPMNPlane bpmnElement="proc_[module_slug]">

      <bpmndi:BPMNShape bpmnElement="start_01" id="shape_start_01">
        <dc:Bounds x="100" y="200" width="36" height="36"/>
      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape bpmnElement="service_[id]" id="shape_service_[id]">
        <dc:Bounds x="180" y="178" width="100" height="80"/>
      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape bpmnElement="rule_[id]" id="shape_rule_[id]">
        <dc:Bounds x="330" y="178" width="100" height="80"/>
      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape bpmnElement="gateway_[id]" id="shape_gw_[id]">
        <dc:Bounds x="480" y="193" width="50" height="50"/>
      </bpmndi:BPMNShape>


      <bpmndi:BPMNShape bpmnElement="end_[id]" id="shape_end_[id]">
        <dc:Bounds x="730" y="200" width="36" height="36"/>
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

## Layout rules (used when emitting BPMNShape / BPMNEdge bounds)

| Element | Width | Height |
|---------|-------|--------|
| Start/End Event | 36 | 36 |
| serviceTask / businessRuleTask | 100 | 80 |
| Gateway | 50 | 50 |

- Initial coordinates: x=100, y=100
- Horizontal spacing: 150 units minimum between elements
- Vertical spacing: 100 units minimum between parallel paths
- Flow direction: left to right

## ID conventions

| Element | Prefix | Example |
|---------|--------|---------|
| Process | `proc_` | `proc_loan_management` |
| Start event | `start_` | `start_application_received` |
| End event | `end_` | `end_loan_approved` |
| serviceTask (crud) | `service_` | `service_create_application` |
| businessRuleTask (logic) | `rule_` | `rule_calculate_interest` |
| Gateway | `gateway_` | `gateway_credit_check` |
| Sequence flow | `flow_` | `flow_001` |
| Shape | `shape_` | `shape_service_create_application` |
| Edge | `edge_` | `edge_001` |
