# Sample output — opscale-bpmn

Anonymized excerpt derived from a working Opscale module
(`Unicoop/membresia`). Shows the SHAPE of what the skill produces,
not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body. The full original file lives in the source module.

---

The XML is **self-contained**: the `<bpmn:process>` documentation carries the
module + modeling standard, and every task's documentation JSON carries its
business step and subprocess — Logics also carry their governing rules and
composed members (CRUDs and Outputs). There are no sendTask nodes: Outputs
live inside their Logic. No companion file is needed to interpret the diagram.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_loans"
  targetNamespace="http://opscale.co/bpmn">

  <bpmn:process id="proc_loans" isExecutable="false">
    <bpmn:documentation>{"module":"loans","standard":"FIBO (Party / Decision concepts)"}</bpmn:documentation>

    <bpmn:laneSet id="ls_loans">
      <bpmn:lane id="lane_admission_preparation" name="SP1 Admission — Preparation">
        <bpmn:flowNodeRef>start_application_submitted</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>service_create_application</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>rule_check_kyc</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>rule_score_application</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>gateway_score_band</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>

    <!-- CRUD step — emitted by the UI layer, not by an Action -->
    <bpmn:serviceTask id="service_create_application" name="Create application">
      <bpmn:documentation>{"type":"crud","oid":"SP-01-01-C01","entity":"applications","action":"create","step":"Receive the application","subprocess":"Admission"}</bpmn:documentation>
      <bpmn:incoming>flow_001</bpmn:incoming>
      <bpmn:outgoing>flow_002</bpmn:outgoing>
    </bpmn:serviceTask>

    <!-- Business-rule step — backed 1:1 by an Action with the same identifier.
         "rules" is the 2.1 prose (BR-NN numbering is assigned later by
         opscale-sipoc); "composed" is the CRUD bundle the rule forces. -->
    <bpmn:businessRuleTask id="rule_check_kyc" name="Check KYC">
      <bpmn:documentation>{"type":"logic","oid":"SP-01-02-L01","id":"check-kyc","step":"Verify the applicant identity","subprocess":"Admission","rules":["an application cannot advance without an acknowledged KYC verification"],"composed":[{"oid":"SP-01-02-L01-C01","entity":"applications","action":"read"},{"oid":"SP-01-02-L01-C02","entity":"verifications","action":"create"},{"oid":"SP-01-02-L01-C03","entity":"applications","action":"update"}]}</bpmn:documentation>
      <bpmn:incoming>flow_002</bpmn:incoming>
      <bpmn:outgoing>flow_003</bpmn:outgoing>
    </bpmn:businessRuleTask>

    <bpmn:businessRuleTask id="rule_score_application" name="Score application">
      <bpmn:documentation>{"type":"logic","oid":"SP-01-03-L01","id":"score-application","step":"Score the application","subprocess":"Admission","rules":["the score combines every verified rule of the active policy"],"composed":[{"oid":"SP-01-03-L01-C01","entity":"verifications","action":"read"},{"oid":"SP-01-03-L01-C02","entity":"scores","action":"create"},{"oid":"SP-01-03-L01-O01","content":"score summary to the analyst"}]}</bpmn:documentation>
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


## Sample docs/plan/bpmn.txt

Reference example — a **recruitment** module (candidate lifecycle inside an approved position requisition). The same example is used for the `.txt` samples of all the Plan skills, so the lists chain: every step here appears in `docs/plan/process.txt` (same subprocesses, same order), every logic id here has a block in `sipoc.txt`, and every entity operated on exists in `dbml.txt`.

One section per subprocess block of `process.txt` (same count, order, ids, names), separated by a blank line: the `SP-XX {name}` line, then each business step with its operations. Top-level lines are only standalone crud (`- {oid} crud: {action} {entity}`) and logic (`- {oid} logic: {kebab-id}`). Under each logic, its composed members are indented two extra spaces with the nested oid `{parent}-[C|L|O]AA` — CRUDs **and Outputs**. **Outputs only ever appear composed inside a Logic, never as a top-level line** (a notification is the effect of a rule resolving). Lines are concise: crud = `{action} {entity}`, logic = bare kebab Action id, output = brief content (never the channel).

```
SP-01 Position requisition
Describe the requested position
- SP-01-01-C01 crud: create requisition
Route the approval chain
- SP-01-02-L01 logic: route-approval
  - SP-01-02-L01-C01 crud: read requisition
  - SP-01-02-L01-C02 crud: create approval
Record each approval decision
- SP-01-03-L01 logic: approve-requisition
  - SP-01-03-L01-C01 crud: update approval
  - SP-01-03-L01-C02 crud: update requisition
  - SP-01-03-L01-O01 output: approval notice to the requester
- SP-01-03-L02 logic: reject-requisition
  - SP-01-03-L02-C01 crud: update approval
  - SP-01-03-L02-C02 crud: update requisition
  - SP-01-03-L02-O01 output: rejection notice to the requester

SP-02 Job posting
Notify internal employees
- SP-02-01-L01 logic: announce-opening
  - SP-02-01-L01-C01 crud: read requisition
  - SP-02-01-L01-O01 output: opening announcement to employees
Publish the opening with tracked links
- SP-02-02-L01 logic: publish-requisition
  - SP-02-02-L01-C01 crud: read requisition
  - SP-02-02-L01-C02 crud: create posting

SP-03 Application and screening
Register each candidate with consent
- SP-03-01-C01 crud: create candidate
Screen resumes against the approved profile
- SP-03-02-L01 logic: screen-candidate
  - SP-03-02-L01-C01 crud: read requisition
  - SP-03-02-L01-C02 crud: update candidate
Send assessments to qualified candidates
- SP-03-03-L01 logic: send-assessment
  - SP-03-03-L01-C01 crud: create assessment
  - SP-03-03-L01-O01 output: assessment invitation to the candidate

SP-04 Interviews and verification
Schedule each interview round
- SP-04-01-L01 logic: schedule-interview
  - SP-04-01-L01-C01 crud: read candidate
  - SP-04-01-L01-C02 crud: create interview
  - SP-04-01-L01-O01 output: interview confirmation with location
Record the standardized evaluation form
- SP-04-02-C01 crud: update interview
Advance or discard with documented reason
- SP-04-03-L01 logic: discard-candidate
  - SP-04-03-L01-C01 crud: update candidate
  - SP-04-03-L01-O01 output: closure message to the candidate
Request work references
- SP-04-04-L01 logic: request-references
  - SP-04-04-L01-C01 crud: create reference
  - SP-04-04-L01-O01 output: reference request to the referee
Request background checks for sensitive positions
- SP-04-05-C01 crud: create background_check

SP-05 Decision and offer
Consolidate the comparative file
- SP-05-01-C01 crud: read candidate
Record the committee decision
- SP-05-02-L01 logic: decide-finalist
  - SP-05-02-L01-C01 crud: read interview
  - SP-05-02-L01-C02 crud: create decision
Send the offer
- SP-05-03-L01 logic: extend-offer
  - SP-05-03-L01-C01 crud: read decision
  - SP-05-03-L01-C02 crud: create offer
  - SP-05-03-L01-O01 output: offer letter to the candidate
Escalate a counteroffer beyond the approved range
- SP-05-04-L01 logic: revalidate-offer
  - SP-05-04-L01-C01 crud: read offer
  - SP-05-04-L01-C02 crud: update offer

SP-06 Hiring and closure
Record the signed acceptance
- SP-06-01-L01 logic: accept-offer
  - SP-06-01-L01-C01 crud: read offer
  - SP-06-01-L01-C02 crud: update offer
Handle a rejected offer
- SP-06-02-L01 logic: reject-offer
  - SP-06-02-L01-C01 crud: update offer
  - SP-06-02-L01-C02 crud: update candidate
Open the employee record
- SP-06-03-L01 logic: open-employee-record
  - SP-06-03-L01-C01 crud: read candidate
  - SP-06-03-L01-O01 output: hiring file handoff to the employee module
Close the requisition as filled
- SP-06-04-L01 logic: hire-candidate
  - SP-06-04-L01-C01 crud: update candidate
  - SP-06-04-L01-C02 crud: update requisition
Archive all candidate files
- SP-06-05-L01 logic: archive-candidates
  - SP-06-05-L01-C01 crud: update candidate
Send the welcome
- SP-06-06-L01 logic: send-welcome
  - SP-06-06-L01-C01 crud: read candidate
  - SP-06-06-L01-O01 output: welcome to the new employee and team
```
