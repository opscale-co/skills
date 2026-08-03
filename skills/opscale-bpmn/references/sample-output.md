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

    <!-- CRUD step — emitted by the UI layer, not by an Action -->
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


## Sample docs/plan/subprocesses/

Reference example — a **recruitment** module (candidate lifecycle inside an approved position requisition). The same example is used for the `.txt` samples of all the Plan skills, so the lists chain: every step here appears in `docs/plan/process.txt` (same subprocesses, same order), every logic id here has a block in `sipoc.txt`, and every entity operated on exists in `dbml.txt`. One file per subprocess block of `process.txt` — filename = subprocess name in kebab-case.

`docs/plan/subprocesses/position-requisition.txt`:

```
Describe the requested position
- crud: create requisition

Route the approval chain
- logic: Route approval (route-approval)

Record each approval decision
- logic: Approve requisition (approve-requisition)
- logic: Reject requisition (reject-requisition)
- output: notify the requester
```

`docs/plan/subprocesses/job-posting.txt`:

```
Notify internal employees
- output: post the opening on the employee portal

Publish the opening with tracked links
- logic: Publish requisition (publish-requisition)
- output: publish to job boards and social networks
```

`docs/plan/subprocesses/application-and-screening.txt`:

```
Register each candidate with consent
- crud: create candidate

Screen resumes against the approved profile
- logic: Screen candidate (screen-candidate)

Send assessments to qualified candidates
- crud: create assessment
- output: email the assessment invitation
```

`docs/plan/subprocesses/interviews-and-verification.txt`:

```
Schedule each interview round
- logic: Schedule interview (schedule-interview)
- output: send the confirmation with location details

Record the standardized evaluation form
- crud: update interview

Advance or discard with documented reason
- logic: Discard candidate (discard-candidate)
- output: send the closure message

Request work references
- crud: create reference
- output: contact the referee

Request background checks for sensitive positions
- crud: create background_check
```

`docs/plan/subprocesses/decision-and-offer.txt`:

```
Consolidate the comparative file
- crud: read candidate

Record the committee decision
- logic: Decide finalist (decide-finalist)

Send the offer
- logic: Extend offer (extend-offer)
- output: send the offer letter

Escalate a counteroffer beyond the approved range
- logic: Revalidate offer (revalidate-offer)
```

`docs/plan/subprocesses/hiring-and-closure.txt`:

```
Record the signed acceptance
- logic: Accept offer (accept-offer)

Handle a rejected offer
- logic: Reject offer (reject-offer)

Open the employee record
- output: hand off the hiring file to the employee module

Close the requisition as filled
- logic: Hire candidate (hire-candidate)

Archive all candidate files
- logic: Archive candidates (archive-candidates)

Send the welcome
- output: email the welcome to the new employee and team
```
