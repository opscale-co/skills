# Sample output — opscale-bpmn

Anonymized excerpt derived from a working Opscale module
(`Unicoop/membresia`). Shows the SHAPE of what the skill produces,
not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body. The full original file lives in the source module.

---

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_loans"
  targetNamespace="http://opscale.co/bpmn">

  <bpmn:process id="proc_loans" isExecutable="false">

    <bpmn:laneSet id="ls_loans">
      <bpmn:lane id="lane_admission_preparation" name="SP1 Admission — Preparation">
        <bpmn:flowNodeRef>start_application_submitted</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>service_create_application</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>rule_check_kyc</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>rule_score_application</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>gateway_score_band</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>

    <!-- CRUD step — emitted by the Nova Resource, not by an Action -->
    <bpmn:serviceTask id="service_create_application" name="Create application">
      <bpmn:documentation>{"type":"crud","entity":"applications","action":"create"}</bpmn:documentation>
      <bpmn:incoming>flow_001</bpmn:incoming>
      <bpmn:outgoing>flow_002</bpmn:outgoing>
    </bpmn:serviceTask>

    <!-- Business-rule step — backed 1:1 by an Action with the same identifier -->
    <bpmn:businessRuleTask id="rule_check_kyc" name="Check KYC">
      <bpmn:documentation>{"type":"logic","id":"check-kyc"}</bpmn:documentation>
      <bpmn:incoming>flow_002</bpmn:incoming>
      <bpmn:outgoing>flow_003</bpmn:outgoing>
    </bpmn:businessRuleTask>

    <bpmn:businessRuleTask id="rule_score_application" name="Score application">
      <bpmn:documentation>{"type":"logic","id":"score-application"}</bpmn:documentation>
      <bpmn:incoming>flow_003</bpmn:incoming>
      <bpmn:outgoing>flow_004</bpmn:outgoing>
    </bpmn:businessRuleTask>

    <!-- Gateway — routes by computed band; downstream flows carry the labels -->
    <bpmn:exclusiveGateway id="gateway_score_band" name="Score band?">
      <bpmn:incoming>flow_004</bpmn:incoming>
      <bpmn:outgoing>flow_band_high</bpmn:outgoing>
      <bpmn:outgoing>flow_band_mid</bpmn:outgoing>
      <bpmn:outgoing>flow_band_low</bpmn:outgoing>
    </bpmn:exclusiveGateway>

    <bpmn:sequenceFlow id="flow_band_high" name="High → Qualified"
                       sourceRef="gateway_score_band"
                       targetRef="gateway_qualified_decision"/>
    <bpmn:sequenceFlow id="flow_band_mid"  name="Mid → SemiQualified"
                       sourceRef="gateway_score_band"
                       targetRef="gateway_semi_qualified"/>
    <bpmn:sequenceFlow id="flow_band_low"  name="Low → Rejected"
                       sourceRef="gateway_score_band"
                       targetRef="rule_reject_application"/>

  </bpmn:process>
</bpmn:definitions>
```
