# Sample output — opscale-process

Reference example — a **recruitment** module (candidate lifecycle inside an
approved position requisition). The same example is used across the Plan
skills so the lists chain: every step here appears in
`docs/plan/subprocesses/` with its operations, every logic id there has a
block in `sipoc.txt`, and every entity operated on exists in `dbml.txt`.

Shows the SHAPE of what the skill produces, not a full real module.

---

## Sample docs/plan/context/names.md

```markdown
# Names — Recruitment

| Canónico | ← alias |
|---|---|
| Requisition | position request, vacancy request, req |
| Candidate | applicant, prospect |
| Opening | job posting, publication, ad |
| Assessment | test, evaluation exam |
| Interview | round, meeting |
| Reference | work reference |
| Background check | verification, screening check |
| Offer | proposal, offer letter |
| Employee record | file, expediente |
```

## Sample docs/plan/process.txt

```
Position requisition
Trigger: a manager requests a new position
Ends with: wait for every approver's decision
1) Describe the requested position
2) Route the approval chain
3) Record each approval decision

Job posting
Trigger: the wait from Position requisition resolved (requisition approved)
Ends with: wait for candidate applications
4) Notify internal employees
5) Publish the opening with tracked links

Application and screening
Trigger: candidate applications arrived
Ends with: wait for assessment results
6) Register each candidate with consent
7) Screen resumes against the approved profile
8) Send assessments to qualified candidates

Interviews and verification
Trigger: assessment results arrived
Ends with: wait for references and background checks
9) Schedule each interview round
10) Record the standardized evaluation form
11) Advance or discard with documented reason
12) Request work references
13) Request background checks for sensitive positions

Decision and offer
Trigger: references and background checks arrived
Ends with: wait for the candidate's response to the offer
14) Consolidate the comparative file
15) Record the committee decision
16) Send the offer
17) Escalate a counteroffer beyond the approved range

Hiring and closure
Trigger: the candidate responded to the offer
Ends with: —
18) Record the signed acceptance
19) Handle a rejected offer
20) Open the employee record
21) Close the requisition as filled
22) Archive all candidate files
23) Send the welcome
```
