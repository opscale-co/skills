# Sample output — opscale-dbml

Anonymized excerpt derived from a working Opscale module
(`Unicoop/membresia`). Shows the SHAPE of what the skill produces,
not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body. The full original file lives in the source module.

---

```dbml
Project Loans {
  database_type: 'MySQL'

  Note: '''
  # Subdomain: Loans — Application lifecycle (policy-driven)
  Source spec: docs/plan/process.txt
  Modeling standard: FIBO (Party / Decision concepts) + ACTUS (ANN)

  ## Bounded Context
  - Core: applications, policies, members, contract_terms
  - Per-cycle: verifications, scores, decisions, requirements, documents
  - Depends on: external Party Reference Data (parties), Auth (users)

  '''
}

Enum ApplicationStatus {
  Pending       [note: 'Just created']
  KycReady      [note: 'KYC acknowledged']
  Qualified     [note: 'Ready for decision']
  Approved      [note: 'Decision recorded; awaiting activation']
  Active        [note: 'Terminal — Member created']
  Rejected      [note: 'Terminal']
}

Table applications {
  id              varchar(26)        [pk, note: 'ULID // type:identifier']
  code            varchar(50)        [not null, unique, note: 'Human-readable application number // type:document']
  status          ApplicationStatus  [not null, default: 'Pending', note: 'Lifecycle state']
  current_cycle   int                [not null, default: 1, note: 'Evaluation cycle, 1-based // type:quantity']

  policy_id       varchar(26)        [ref: > policies.id, not null, note: 'Active policy applied // type:identifier']
  party_id        varchar(26)        [not null, note: '// external_ref:parties | organization.parties — Counterparty that applies']
  assigned_to     varchar(26)        [null,     note: '// external_ref:users | auth.users — assigned operator']

  created_at      timestamp          [not null]
  updated_at      timestamp          [not null]

  indexes {
    status [name: 'idx_applications_status']
  }
}

Table verifications {
  id              varchar(26)   [pk, note: 'ULID // type:identifier']
  application_id  varchar(26)   [ref: > applications.id, not null, note: 'Evaluated application // type:identifier']
  cycle_number    int           [not null, default: 1, note: 'Cycle this verification belongs to // type:quantity']
  rule_id         varchar(26)   [ref: > rules.id, not null, note: 'Rule verified // type:identifier']
  score           decimal(2,1)  [null, note: 'Weighted score for the chosen option // type:rating']

  created_at      timestamp     [not null]
  updated_at      timestamp     [not null]

  indexes {
    (application_id, cycle_number, rule_id) [unique, name: 'uq_verifications_cycle_rule']
  }
}

Table members {
  id              varchar(26)  [pk, note: 'ULID // type:identifier']
  application_id  varchar(26)  [ref: > applications.id, not null, unique, note: 'Origin application // type:identifier']
  party_id        varchar(26)  [not null, note: '// external_ref:parties | organization.parties']
  code            varchar(50)  [not null, unique, note: 'Member number // type:document']
  joined_at       timestamp    [not null, note: 'Activation moment // type:moment']
}

// Intra-subdomain relation
Ref: verifications.application_id > applications.id

// External references NEVER get a Ref line — the target table is not declared
// in this file, so @dbml/core would reject it. They live ONLY as column notes
// ('// external_ref:parties' above).
```


## Sample docs/plan/dbml.txt

Reference example — a **recruitment** module (candidate lifecycle inside an approved position requisition). The same example is used for the `.txt` sample of all four Plan skills, so the lists chain: every step here appears in `docs/plan/subprocesses/` with its operations, every logic id there has a block in `sipoc.txt`, and every entity operated on exists in `dbml.txt`.

```
requisition
approval
posting
candidate
assessment
interview
reference
background_check
offer
decision
```
