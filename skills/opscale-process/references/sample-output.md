# Sample output — opscale-process

Anonymized excerpt derived from a working Opscale module
(`Unicoop/membresia`). Shows the SHAPE of what the skill produces,
not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body. The full original file lives in the source module.

---

```markdown
# Module: Credit Cycle (Admission + Offboarding — Policy-driven)

The module covers the full cycle of the Application: admission (from
Applicant to active Member) and offboarding (from active Member to Inactive).
Each one is organized into two mirrored subprocesses — **Preparation**
gathers evidence and opens the package; **Review** deliberates and resolves.

## Name normalization

Applicant         ← person, requester (external Counterparty in its applicant role)
Application       ← request, submission
Policy            ← versioned Policy (catalog of rules and conditions)
Rule              ← Rule (evaluable criterion within a Policy)
Option            ← RuleOption (closed answer, scorable 0..n)
Verification      ← Verification (record of the option chosen per Rule in a cycle)
Score             ← Score (weighted aggregate for the cycle)
Decision          ← Decision (Approve | Reject)
Member            ← counterparty already active in the system
Cycle             ← `current_cycle` of the Application (1-based)

**External references** (another subdomain owns them):
Counterparty      ← legal identity of the Applicant (FIBO Party Reference Data)
Internal user     ← analyst (`verified_by`), decision maker (`decided_by`)

## Lifecycle

### Application
**Stages:** Pending → KycReady → Evaluating → Qualified → Approved → Active
(alternate stages: `SemiQualified` — loop back to `Qualified`; terminal: `Active`, `Rejected`)
**Flows:**
- Register application — ends at `Pending`
- Check KYC — ends at `KycReady`
- Evaluate application — ends at `Evaluating`
- Score application — ends at `Qualified`
- Complete requirements — ends at `Qualified`
- Resolve application — ends at `Approved`
- Activate membership — ends at `Active`

## SP1 — Admission: Preparation

*Trigger:* a person decides to apply.
*Actor:* Admission officer.

1) Register Application (status `Pending`, `current_cycle=1`, active Policy).
2) `CheckKyc` — upstream KYC ok → `KycReady`.
3) `EvaluateApplication` — for each `Rule` in the Policy, a
   `Verification` is recorded with the chosen `RuleOption` → `Evaluating`.
4) `ScoreApplication` — computes the weighted `Score` and routes by band:
   - high band → `Qualified`
   - middle band → `SemiQualified` (materializes `Requirement` / `Document`)
   - low band → `Rejected` (terminal)
5) (wait) The Applicant completes the `Requirement`s and uploads the `Document`s.
6) `CheckRequirements` — gate: every `Document.file_url` non-null and every
   `Requirement.data` non-empty for the current cycle → `SemiQualified → Qualified`.

## Relations

- Applicant (external Counterparty) submits an Application (1—1 current;
  N historical through re-applications).
- Application → Policy (N—1).
- Application → Verifications (1—N) → Rule / RuleOption.
- Application → Score (1—N: one per cycle).
- Application → Decision (1—N: typically one final Approve + 0..N
  intermediate ChangedRequirements).
- Application → Member (1—0..1) — UNIQUE.

## Narrative

**SP1 — Admission, Preparation.** When the Application is created it is
assigned the active Policy and enters `Pending` with `current_cycle=1`.
`CheckKyc` is a pure acknowledgment — the real data lives in upstream
modules — and moves the Application to `KycReady`. `EvaluateApplication`
materializes one `Verification` per `Rule` and moves to `Evaluating`.
`ScoreApplication` computes the cycle's weighted score and routes by band.
```
