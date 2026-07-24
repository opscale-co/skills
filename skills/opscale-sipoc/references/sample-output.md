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
**BPMN task:** Approve application
**Subprocess:** SP2 Admission — Review
**Step:** Resolve the application
**Business Rules:** BR-01, BR-02
**Composes:** none

Closes an `Application` in `Qualified` with one of three approval
sub-types, recording a `Decision(Approve)` in the current cycle.

## Suppliers
- 💻 `ScoreApplication` (High branch) or `CheckRequirements` — provides
  `application` in `Qualified` **via Nova context**
- 👤 Admission committee — provides `approvalType`, `reason` and overrides
- 💻 `config('loans.contract_terms_template')` — default template
- 💻 Auth subdomain — provides `decided_by` **via `auth()->id()`**

## Inputs
| Input            | Source                | How obtained                              | Type   | Validation rules          | Description                                 |
|------------------|-----------------------|-------------------------------------------|--------|---------------------------|--------------------------------------------|
| application      | 💻 Nova context        | auto-resolved from the Nova resource page | model  | status='Qualified'        | auto-resolved via `ResolvesFromContext`    |
| approvalType     | 👤 Committee (Select)  | user picks in the Action form dropdown    | string | required, in: Std,CT,CR   | dropdown in the Action form                |
| reason           | 👤 Committee (Textarea)| user types in the Action form             | string | required, min:10, max:2000| mandatory textarea in the form             |
| extraReqTypes    | 👤 Committee (MultiSelect)| user picks in the Action form          | array  | nullable                  | only visible for the ChangedRequirements sub-type |

## Process
1. resolve `application` from Nova context; guard `status === Qualified` (BR-01)
2. switch (`approvalType`):
   - **Standard** → `approveAsIs(reason, Standard, [])`
   - **ChangedTerms** → `approveAsIs(reason, ChangedTerms, overrides)`
   - **ChangedRequirements** → `approveWithChangedRequirements(reason, extraTypes)`
3. within DB transaction: create `Decision`, create `ContractTerms`
   (Standard/ChangedTerms), update `applications.status`
4. return the result array

## Outputs
| Output key        | Type           | Description                       | Consumers                |
|-------------------|----------------|-----------------------------------|--------------------------|
| success           | bool           | Whether the operation succeeded   | All callers              |
| approval_type     | string         | Sub-type issued                   | 👤 Committee, audit      |
| decision_id       | string (ULID)  | Newly created `Decision`          | 👤 Committee, audit      |
| contract_terms_id | string?(ULID)  | `ContractTerms` (Standard/CT only)| 💻 `ActivateApplication` |
| new_status        | string         | Approved | SemiQualified         | 💻 BPMN downstream       |

## Customers
- 💻 `ActivateApplication` (Standard / ChangedTerms) — consumes
  `ContractTerms` + `application` to create the `Member`
- 💻 `CheckRequirements` (ChangedRequirements) — consumes the
  `Application` again once the Applicant fulfills the new `Requirement`s
- 👤 Admission committee — consumes `Decision` as an auditable record

## Business Rules enforced
- **BR-01** — Strict transitions: `Qualified → Approved` (Standard,
  ChangedTerms) or `Qualified → SemiQualified` (ChangedRequirements).
- **BR-02** — One `Decision(Approve)` per cycle; ChangedRequirements does
  not erase the previous decision, it opens a new cycle.

## Failure modes
- **Soft failure** (return `['success' => false, 'message' => '…']`):
  - `approvalType === ChangedRequirements` and `extraTypes` is empty.
- **Hard failure** (throw `RuntimeException`):
  - `application.status !== Qualified` — precondition violated (BR-01).
  - `current_cycle + 1 > policy.max_iterations` — bound exceeded.
  - missing `reason` — blocked in `validateAttributes()` before
    entering `handle()`.
```


## Sample final/sipoc.txt

Reference example — a **recruitment** module (candidate lifecycle inside an approved position requisition). The same example is used for the `.txt` sample of all four Plan skills, so the lists chain: every step here appears in `bpmn.txt` with its operations, every logic id in `bpmn.txt` has a block in `sipoc.txt`, and every entity operated on exists in `dbml.txt`.

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
