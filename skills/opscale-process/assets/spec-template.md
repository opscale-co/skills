# Template — spec.md (structured process description)

Fill this in during Phase 10, after the narrative.

---

## Output: spec.md (structured process description)

```markdown
# Process Spec: [Process Name]

## Bounded Context

- **Subdomain:** [slug]
- **Business Domain:** [from taxonomy]
- **Complexity:** [Low / Medium / High / Very High]
- **Responsibility:** [one sentence — what this subdomain owns and is solely responsible for]
- **Depends on:** [other subdomains whose outcomes this one consumes, or "none"]
- **Notifies:** [other subdomains this one signals, or "none"]
- **Independence check:** [confirm this subdomain can run without reaching into other subdomains directly]

## Overview

[2–3 sentences. What outcome does this process produce? Who benefits? What is in scope and what is out of scope?]

## Suppliers

| ID | Supplier | Type | Provides (input ID) | Notes |
|----|----------|------|---------------------|-------|
| SUP-01 | [Name] | 🌐 / 👤 / 💻 | I-00 (primary), I-01, I-02 | [when they intervene] |

## Inputs

### Primary input — I-00

| Field | Value |
|---|---|
| Name | [name] |
| Type | 📩 / 📄 / 📝 / ✅ |
| Supplier | SUP-NN — [supplier name] |
| Trigger condition | [what arrival of this input means] |
| Required content | [the minimum information it must carry] |
| Variants | [if there are forms / channels / formats] |

### Intermediate inputs

| ID | Name | Type | Supplier | Arrives at step | Mandatory? | Timeout behaviour |
|----|------|------|----------|-----------------|------------|-------------------|
| I-01 | [name] | 📩 / 📄 / 📝 / ✅ | SUP-NN | E-NN (⏳) | yes/no | [what happens if it never arrives] |

## Process Flow

> Sequence first. Every node is 🔨 / ⏳ / 🔀. Apply Rules 3, 4, 5 at every step.

### Start Event — E-00 — Trigger
- **Triggered by:** arrival of I-00 from SUP-NN
- **Flows to:** S-01

### Step S-01 — [Name] — 🔨 [📩/📄/📝/⚙️/✅]
- **Actor:** [👤 internal role or 💻 system]
- **Action:** [plain business language]
- **Reads:** [artifacts/records consulted]
- **Produces:** [the artifact this step generates, with its type]
- **Governed by:** BR-NN
- **Flows to:** S-02

### Step S-02 — [Name] — 🔨 ⚙️ Operation
- **Actor:** 💻 [system name]
- **Action:** [calculation / algorithm / business rule evaluation — describe inputs and what is computed]
- **Reads:** [data consumed]
- **Produces:** [the computed result — internal only, not an output]
- **Becomes Action:** `[ActionClassName]` (downstream — opscale-logic will materialize this)
- **Flows to:** G-01

### Gateway G-01 — Decision — [question]
- **Decided after:** S-02 (⚙️) — Rule 5 satisfied
- If **[condition A]** → S-03
- If **[condition B]** → E-90 (End — [reason])
- **Governed by:** BR-NN

### Intermediate Event E-01 — ⏳ Wait — [what we wait for]
- **Waits for:** I-NN from SUP-NN
- **On occurrence:** → S-04
- **Timeout (BR-NN):** → S-05 or E-91

### Step S-NN — [Name] — 🔨 📩 Notification (intermediate output O-NN)
- **Actor:** 💻 [system]
- **Action:** send [notification name] via [channel: email / sms / whatsapp / webhook / push / dashboard]
- **Customer:** CUS-NN — [customer name]
- **Flows to:** ⏳ E-NN (Rule 4 — wait for response) or → END

### End Event E-99 — Success — Primary output O-00 produced
- **Process ends when:** [the outcome described in the Overview is achieved]
- **Output:** O-00
- **Guarantees:** [post-conditions]

### End Event E-90 / E-91 / E-92 — Non-success terminations
- **State of artifacts on termination:** [what remains, what is discarded]

## Outputs

### Primary output — O-00

| Field | Value |
|---|---|
| Name | [name] |
| Type | 📩 or 📄 only |
| Produced by | S-NN |
| Customer | CUS-NN — [customer name] |
| Channel | email / sms / whatsapp / pdf / webhook / dashboard |
| Reaches end event | E-99 |
| Content summary | [what the customer receives] |

### Intermediate outputs

| ID | Name | Type | Produced by | Customer | Channel | Purpose |
|----|------|------|-------------|----------|---------|---------|
| O-01 | [name] | 📩 / 📄 | S-NN | CUS-NN | [channel] | [why it is emitted before the final output] |

## Customers

| ID | Customer | Type | Receives | Action they take | SLA / urgency |
|----|----------|------|----------|------------------|---------------|
| CUS-01 | [name] | 🌐 / 👤 / 💻 | O-00 (primary), O-01 | [what they do with it] | [if any] |

## Business Rules

- **BR-01**: [condition → consequence] — applied at [S-NN / G-NN / E-NN]
- **BR-02**: …

> Each BR is numbered so it can be referenced from the flow, from the BPMN, and from per-Action SIPOC files.

## Pre-conditions

- [ ] [What must be true before the process can begin — concrete and verifiable]

## Post-conditions

- [ ] [What this process guarantees after reaching E-99]

## Assumptions

- *[Something inferred from context — should be validated with the business owner]*

## Open Questions

- [ ] [Decision or information still needed before downstream work begins]

## Process Dependencies

| Process | Relationship | Detail |
|---------|-------------|--------|
| [Process X] | Depends on | [outcome consumed] |
| [Process Y] | Notifies | [signal sent, from which Event] |

## Coherence Validation Report

```
═══════════════════════════════════════════════════════════════
PROCESS COHERENCE VALIDATION — applied to this description
═══════════════════════════════════════════════════════════════
[ ] Rule 1 — Every input bound to a supplier
       I-00 → SUP-NN ✓ ; I-01 → SUP-NN ✓ ; …
[ ] Rule 2 — Every output bound to a customer
       O-00 → CUS-NN ✓ ; O-01 → CUS-NN ✓ ; …
[ ] Rule 3 — Every step is 🔨 or ⏳ or 🔀
       S-01 (🔨 📝) ✓ ; S-02 (🔨 ⚙️) ✓ ; E-01 (⏳) ✓ ; G-01 (🔀) ✓ ; …
[ ] Rule 4 — After 🔨 📩 / 📄, the next node is ⏳ or END
       S-NN (🔨 📩) → E-NN (⏳) ✓
[ ] Rule 5 — 🔀 only after 📝 / ⚙️ / ✅
       G-01 ← S-02 (⚙️) ✓ ; G-02 ← E-NN (⏳ ✅) ✓ ; …
[ ] Rule 6A — ⚙️ Operations only as intermediate steps
       No input or output classified ⚙️ ✓
[ ] Rule 6B — 📝 Records not in outputs
       No output classified 📝 ✓
[ ] Rule 6C — ✅ Authorizations not in outputs
       No output classified ✅ ✓
═══════════════════════════════════════════════════════════════
STATUS: [ ] PASS — opscale-dbml may proceed
        [ ] FAIL — list blocking items below
═══════════════════════════════════════════════════════════════
```
```

---
