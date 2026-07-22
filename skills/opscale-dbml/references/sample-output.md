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
  Source spec: .specify/specs/001-admission/final/process.md
  Modeling standard: FIBO (Party / Decision concepts) + ACTUS (ANN)

  ## Bounded Context
  - Core: applications, policies, members, contract_terms
  - Per-cycle: verifications, scores, decisions, requirements, documents
  - Depends on: external Party Reference Data (parties), Auth (users)

  ## Key Business Rules
  - BR-01: a Counterparty may have N applications historically, but at most
    one Member per application (UNIQUE members.application_id)
  - BR-02: strict status transitions on applications (see ApplicationStatus)
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
  id              varchar(26)        [pk, note: 'ULID']
  code            varchar(20)        [not null, unique]
  status          ApplicationStatus  [not null, default: 'Pending']
  current_cycle   int                [not null, default: 1]

  policy_id       varchar(26)        [ref: > policies.id, not null]
  party_id        varchar(26)        [not null, note: '// external_ref:parties — Counterparty that applies']
  assigned_to     varchar(26)        [null,     note: '// external_ref:users — assigned operator']

  created_at      timestamp          [not null]
  updated_at      timestamp          [not null]

  indexes {
    status [name: 'idx_applications_status']
  }
}

Table verifications {
  id              varchar(26)  [pk]
  application_id  varchar(26)  [ref: > applications.id, not null]
  cycle_number    int          [not null, default: 1]
  rule_id         varchar(26)  [ref: > rules.id, not null]
  score           float        [null]

  created_at      timestamp    [not null]
  updated_at      timestamp    [not null]

  indexes {
    (application_id, cycle_number, rule_id) [unique, name: 'uq_verifications_cycle_rule']
  }
}

Table members {
  id              varchar(26)  [pk]
  application_id  varchar(26)  [ref: > applications.id, not null, unique]
  party_id        varchar(26)  [not null, note: '// external_ref:parties']
  code            varchar(20)  [not null, unique]
  joined_at       timestamp    [not null]
}

// Intra-subdomain relation
Ref: verifications.application_id > applications.id

// External reference — virtual model, no FK constraint
Ref: applications.party_id > parties.id  // external_ref
```
