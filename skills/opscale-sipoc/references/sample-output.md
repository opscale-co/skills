# Sample output — opscale-sipoc

Anonymized excerpt derived from a working Opscale module
(`Unicoop/membresia`). Shows the SHAPE of what the skill produces,
not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body. The full original file lives in the source module.

---

```markdown
# SIPOC — Approve Application

**Identifier:** `approve-application`
**Operation:** `SP-02-03-L01`
**BPMN task:** Approve application
**Subprocess:** SP-02 Admission — Review
**Step:** Resolve the application
**Business Rules:** BR-01, BR-02
**Composes:** none

Closes an `Application` in `Qualified` with one of three approval
sub-types, recording a `Decision(Approve)` in the current cycle.

## SIPOC

| Suppliers | Inputs | Process | Outputs | Customers |
|---|---|---|---|---|
| 💻 System | application | crud: read application | success | All callers |
| 👤 User | approvalType | crud: create decision | approval_type | 👤 User |
| 💻 System | reason | crud: create contract_terms | decision_id | 💻 System |
| | extraReqTypes | crud: update application | contract_terms_id | |
| | | output: decision notice to the applicant | new_status | |

## Suppliers
- 💻 System — provides `application` in `Qualified` **via UI context** and
  `decided_by` **via the authenticated-user context**
- 👤 User — provides `approvalType`, `reason` and overrides
- 💻 System — provides the default template **via module configuration**

## Inputs
| Input            | Source | How obtained                              | Type            | Validation rules          | Description                                 |
|------------------|--------|-------------------------------------------|-----------------|---------------------------|--------------------------------------------|
| application      | 💻     | auto-resolved from the UI context         | application     | status='Qualified'        | whole record — entity from dbml.dbml       |
| approvalType     | 👤     | user picks in the Action form dropdown    | ApprovalType    | required                  | Enum declared in dbml.dbml                 |
| reason           | 👤     | user types in the Action form             | description     | required                  | business type from the registry            |
| extraReqTypes    | 👤     | user picks in the Action form             | multiOptions    | nullable                  | only visible for the ChangedRequirements sub-type |

## Process
1. resolve `application` from UI context; guard `status === Qualified` (BR-01)
2. switch (`approvalType`):
   - **Standard** → `approveAsIs(reason, Standard, [])`
   - **ChangedTerms** → `approveAsIs(reason, ChangedTerms, overrides)`
   - **ChangedRequirements** → `approveWithChangedRequirements(reason, extraTypes)`
3. within DB transaction: create `Decision`, create `ContractTerms`
   (Standard/ChangedTerms), update `applications.status`
4. return the result array

## Outputs
| Output key        | Type              | Description                       | Consumers    |
|-------------------|-------------------|-----------------------------------|--------------|
| success           | bool              | Whether the operation succeeded   | All callers  |
| approval_type     | ApprovalType      | Sub-type issued (Enum)            | 👤           |
| decision_id       | identifier        | Newly created `Decision`          | 👤           |
| contract_terms_id | identifier        | `ContractTerms` (Standard/CT only)| 💻           |
| new_status        | ApplicationStatus | Approved \| SemiQualified (Enum)  | 💻           |

## Customers
- 💻 System — consumes `ContractTerms` + `application` downstream
  (activation on Standard / ChangedTerms; re-verification on
  ChangedRequirements)
- 👤 User — consumes `Decision` as an auditable record

## Business Rules enforced
- **BR-01** — Strict transitions: `Qualified → Approved` (Standard,
  ChangedTerms) or `Qualified → SemiQualified` (ChangedRequirements).
- **BR-02** — One `Decision(Approve)` per cycle; ChangedRequirements does
  not erase the previous decision, it opens a new cycle.

## Failure modes
- **Soft failure** (returns `success=false` + `message`):
  - `approvalType === ChangedRequirements` and `extraTypes` is empty.
- **Hard failure** (throws):
  - `application.status !== Qualified` — precondition violated (BR-01).
  - `current_cycle + 1 > policy.max_iterations` — bound exceeded.
  - missing `reason` — blocked by input validation before the
    Action body runs.
```


## Sample docs/plan/sipoc.txt

Reference example — a **recruitment** module (candidate lifecycle inside an approved position requisition). The same example is used for the `.txt` sample of all four Plan skills, so the lists chain: every step here appears in `docs/plan/bpmn.txt` with its operations, every logic id there has a block in `sipoc.txt`, and every entity operated on exists in `dbml.txt`.

```
Route approval (route-approval)
- read requisition (position type, salary range, level)
- create approval (one per required approver)
- update requisition.status -> in_approval

Approve requisition (approve-requisition)
- read approval (verify pending and in order)
- update approval (decision, signature, timestamp)
- update requisition.status -> approved (when the chain completes)

Reject requisition (reject-requisition)
- read approval (verify pending and in order)
- update approval (decision, signature, timestamp)
- update requisition.status -> rejected

Publish requisition (publish-requisition)
- read requisition (verify status = approved)
- create posting (one per channel, tracked link)
- update requisition.status -> published

Screen candidate (screen-candidate)
- read requisition (approved profile)
- read candidate (verify status = applied; resume, assessment results)
- update candidate.status -> screened | discarded

Schedule interview (schedule-interview)
- read candidate (verify status = screened and assessments complete)
- create interview
- update candidate.status -> interviewing

Discard candidate (discard-candidate)
- read candidate (verify not hired)
- update candidate (documented reason)
- update candidate.status -> discarded

Decide finalist (decide-finalist)
- read interview (scores per finalist)
- read reference (responses)
- read background_check (results)
- create decision
- update candidate.status -> selected

Extend offer (extend-offer)
- read candidate (verify status = selected)
- create offer
- update candidate.status -> offered

Revalidate offer (revalidate-offer)
- read offer (counteroffer vs approved range)
- create approval (revalidation of the changed terms)
- update offer (approved new terms)
- update offer.status -> sent (re-enters the accept / reject cycle)

Accept offer (accept-offer)
- read offer (verify sent and within the response term)
- update offer.status -> accepted

Reject offer (reject-offer)
- read offer (verify sent and within the response term)
- update offer.status -> rejected
- update candidate.status -> discarded (offer declined)

Hire candidate (hire-candidate)
- read offer (verify status = accepted)
- update candidate.status -> hired
- update requisition.status -> filled

Archive candidates (archive-candidates)
- read requisition (verify status = filled)
- update candidate.status -> archived (all candidates in the process)
```
