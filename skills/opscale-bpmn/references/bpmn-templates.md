# BPMN XML templates — verbatim reference

These are the canonical XML snippets the skill assembles. Names follow Opscale conventions: `verb + noun` in natural language for `businessRuleTask`, kebab-case `id` inside `<documentation>`.

## Task type snippets

### serviceTask — `crud`

Persistence and query operations on domain entities. No business logic, no conditions, no transformations.

```xml
<bpmn:serviceTask id="service_[id]" name="[Verb Entity]">
  <bpmn:documentation>{"type":"crud","entity":"[dbml_table_name]","action":"[create|read|update|delete]"}</bpmn:documentation>
  <bpmn:incoming>flow_[id]</bpmn:incoming>
  <bpmn:outgoing>flow_[id]</bpmn:outgoing>
</bpmn:serviceTask>
```

### businessRuleTask — `logic`

Encapsulated business operation. Name MUST be `verb + noun` in natural language (sentence case). The `id` inside `<documentation>` is the kebab-case slug.

```xml
<bpmn:businessRuleTask id="rule_[id]" name="[Verb noun in natural language]">
  <bpmn:documentation>{"type":"logic","id":"[kebab-case-id]"}</bpmn:documentation>
  <bpmn:incoming>flow_[id]</bpmn:incoming>
  <bpmn:outgoing>flow_[id]</bpmn:outgoing>
</bpmn:businessRuleTask>
```

### sendTask — `output`

Dispatches something that leaves the system — email, push, PDF, SMS, WhatsApp, webhook. One channel per task.

```xml
<bpmn:sendTask id="send_[id]" name="[Send description]">
  <bpmn:documentation>{"type":"output","channel":"[email|push|sms|whatsapp|pdf|webhook|dashboard]","trigger":"[kebab-case-action-id]"}</bpmn:documentation>
  <bpmn:incoming>flow_[id]</bpmn:incoming>
  <bpmn:outgoing>flow_[id]</bpmn:outgoing>
</bpmn:sendTask>
```

## Full `docs/plan/logic.bpmn` skeleton

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

    <!-- Exclusive Gateway -->
    <bpmn:exclusiveGateway id="gateway_[id]" name="[Condition?]">
      <bpmn:incoming>flow_003</bpmn:incoming>
      <bpmn:outgoing>flow_004</bpmn:outgoing>
      <bpmn:outgoing>flow_005</bpmn:outgoing>
    </bpmn:exclusiveGateway>

    <!-- Output Task -->
    <bpmn:sendTask id="send_[id]" name="[Send description]">
      <bpmn:documentation>{"type":"output","channel":"email","trigger":"[kebab-case-id]"}</bpmn:documentation>
      <bpmn:incoming>flow_004</bpmn:incoming>
      <bpmn:outgoing>flow_006</bpmn:outgoing>
    </bpmn:sendTask>

    <!-- End Events -->
    <bpmn:endEvent id="end_[id]" name="[Post-condition from spec]">
      <bpmn:incoming>flow_006</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="end_[id2]" name="[Alternative end]">
      <bpmn:incoming>flow_005</bpmn:incoming>
    </bpmn:endEvent>

    <!-- Sequence Flows -->
    <bpmn:sequenceFlow id="flow_001" sourceRef="start_01" targetRef="service_[id]"/>
    <bpmn:sequenceFlow id="flow_002" sourceRef="service_[id]" targetRef="rule_[id]"/>
    <bpmn:sequenceFlow id="flow_003" sourceRef="rule_[id]" targetRef="gateway_[id]"/>
    <bpmn:sequenceFlow id="flow_004" name="[condition true]"  sourceRef="gateway_[id]" targetRef="send_[id]"/>
    <bpmn:sequenceFlow id="flow_005" name="[condition false]" sourceRef="gateway_[id]" targetRef="end_[id2]"/>
    <bpmn:sequenceFlow id="flow_006" sourceRef="send_[id]" targetRef="end_[id]"/>

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

      <bpmndi:BPMNShape bpmnElement="send_[id]" id="shape_send_[id]">
        <dc:Bounds x="580" y="178" width="100" height="80"/>
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
| serviceTask / businessRuleTask / sendTask | 100 | 80 |
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
| sendTask (output) | `send_` | `send_approval_notification` |
| Gateway | `gateway_` | `gateway_credit_check` |
| Sequence flow | `flow_` | `flow_001` |
| Shape | `shape_` | `shape_service_create_application` |
| Edge | `edge_` | `edge_001` |
