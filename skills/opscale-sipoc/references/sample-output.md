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
| Input            | Source                | Type   | Validation rules          | Description                                 |
|------------------|-----------------------|--------|---------------------------|--------------------------------------------|
| application      | 💻 Nova context        | model  | status='Qualified'        | auto-resolved via `ResolvesFromContext`    |
| approvalType     | 👤 Committee (Select)  | string | required, in: Std,CT,CR   | dropdown in the Action form                |
| reason           | 👤 Committee (Textarea)| string | required, min:10, max:2000| mandatory textarea in the form             |
| extraReqTypes    | 👤 Committee (MultiSelect)| array | nullable               | only visible for the ChangedRequirements sub-type |

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
