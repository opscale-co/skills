# Sample output — opscale-iterate

Anonymized excerpt derived from a working Opscale module
(`Unicoop/membresia`). Shows the SHAPE of what the skill produces,
not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body. The full original file lives in the source module.

---

## 1. Iteration log — `.specify/specs/001-admission/logs/dbml.md`

```markdown
# opscale-dbml — Phase Log
Module: 001-admission (Loan application lifecycle — admission + withdrawal)
Generated: 2026-06-28T14:12:00Z

> Modeling standard: FIBO (Party / Membership / Decision) + ACTUS
> (annuity contract).

## Phase 1 — Identify entities (reconciled against the chosen standard)

17 tables, grouped by aggregate:

**Policy catalog (4)** — `policies`, `rules`, `rule_options`, `conditions`.
**Application + per-cycle + outputs (9)** — `applications`,
  `verifications`, `scores`, `decisions`, `requirements`, `documents`,
  `contract_terms`, `members`, `contract_docs`.
**Withdrawal (4)** — `withdrawal_requests`, `withdrawal_documents`,
  `withdrawal_decisions`, `beneficiaries`.

## Phase 2 — Identify external references (virtual models)

| Owning subdomain | Virtual table              | Columns                                   |
|------------------|----------------------------|-------------------------------------------|
| parties          | (FIBO Party Reference Data)| `applications.party_id`, `members.party_id` |
| users            | (Auth)                     | `applications.assigned_to`, `decisions.decided_by` |

## Phase 3 — Validation

- `npx @dbml/cli validate` → ok
- `npx @dbml/cli render --to dbml` → no orphans
- All 6 cross-subdomain columns carry `// external_ref:<subdomain>` notes
```

## 2. Conventional Commit (from `opscale-iterate` end-of-step)

```
feat(loans/dbml): reconcile entities to FIBO + ACTUS standards

Phase 1 trimmed 3 redundant tables (merged into per-cycle), Phase 2
externalized `parties` and `users` as virtual models with
`// external_ref:` notes, Phase 3 validation clean.

Closes #12

Co-Authored-By: Claude Code <noreply@anthropic.com>
```
