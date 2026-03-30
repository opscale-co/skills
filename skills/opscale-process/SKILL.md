---
name: opscale-process
description: >
  Enriches a casual or informal description of an Opscale/Laravel Nova module into a
  structured business specification and writes it to the spec-kit path ready for
  downstream skills. Use this skill whenever the user describes a module, feature, or
  functionality — even as a quick sentence like "I need a module to manage customer invoices"
  — and needs it converted into a complete spec with actors, actions, artifacts, business
  rules, triggers, and pre/post conditions. This is Step 1 in the Opscale sequence and
  must run BEFORE opscale-dbml, opscale-bpmn, or any code. Also trigger when the user
  says "I want to spec a module", "help me think through this feature", "let's define
  this process", or presents a vague idea that needs business context before development
  can begin.
---

# opscale-process

## Purpose

Turn a rough, casual description of a module into two things:

1. A **bounded context definition** — the subdomain contract used by all downstream skills
2. A **business spec** — a plain-language document readable by a business owner, not a developer

Both are written to `.specify/specs/{NNN}-{module-name}/spec.md`.

The user will rarely speak in technical terms. *"we need something to track overdue payments"* is a valid input. The skill bridges that gap without making the user think like a developer.

---

## Output Location

```
.specify/specs/{NNN}-{module-name}/spec.md
```

Where `{NNN}` is the next available three-digit number in `.specify/specs/` (e.g. `001`, `002`).
Where `{module-name}` is a short kebab-case name derived from the module description (e.g. `order-management`, `invoice-processing`).

If `.specify/` does not exist, ask the user if they want to initialize it now.
If yes, run the `opscale-init` workflow inline before continuing.
If no, stop and explain that `.specify/` is required for spec-driven development.

---

## Workflow

### Step 1 — Read and classify the input

Accept any form of input:
- A single sentence: *"module to manage customer orders"*
- A paragraph with scattered ideas
- A partial doc or copy-paste from WhatsApp/Slack

Extract: what problem is being solved, who is involved, what actions are mentioned, what data is touched.

Then map the module to the most likely **Business domain** (see Reference: Common Business Process Taxonomy below).
This classification drives complexity expectations and helps infer missing actors and flows
that are standard for that domain type.

---

### Step 2 — Ground with a real-world reference (if input is very brief)

If the input is a single sentence or lacks enough context to identify actors and artifacts,
ask one grounding question:

> *"To make sure I get this right — is this similar to how [familiar example] works?
> Like how [well-known company or system] handles [process type]?"*

Use the business process taxonomy to suggest a concrete reference that matches the identified domain.
Skip this step if the input already has enough context.

---

### Step 3 — Identify gaps

Map what is missing across the six required categories. If critical gaps exist, ask
**one focused batch of questions** — not one at a time, not a wall of ten. Keep the tone conversational.

| Category | Key questions |
|----------|--------------|
| **Actors** | Who uses this? Who approves? Are there automatic system actions? |
| **Actions** | What can each actor do? What happens without human intervention? |
| **Artifacts** | What data is created, read, or modified? Any reports or notifications? |
| **Business rules** | What restrictions apply? What conditions must be met? |
| **Triggers** | What starts the process? Manual, scheduled, or event-based? |
| **Pre/Post conditions** | What must exist before? What is guaranteed after? |

When inferring missing details, apply the **inference rules** from Quality Rules below.
If enough context exists to make reasonable inferences, proceed and flag them as assumptions.

---

### Step 4 — Confirm approach before writing

Before generating the full spec, present a brief summary:

```
Before I write the spec, here's what I'm working with:

- **Module name:** [proposed name]
- **Subdomain:** [slug]
- **Business domain:** [e.g. Sales/Order Management, Finance/Accounting]
- **Complexity:** [Low / Medium / High / Very High — see complexity reference]
- **Main actor:** [who drives the process]
- **Other actors:** [list]
- **Core problem:** [one sentence]
- **Depends on:** [other modules this reads from, or "none"]
- **Notifies:** [other modules this emits events to, or "none"]
- **Key assumptions:** [2-3 bullets]
- **Open questions:** [anything that blocks completeness]

Does this match what you have in mind?
```

Adjust based on feedback, then proceed.

---

### Step 5 — Write the spec

Write the full document to `.specify/specs/{NNN}-{module-name}/spec.md`.
Language must be **plain and business-focused** — no PHP, no Laravel, no database terms.
Scale detail to the complexity level identified in Step 4.

---

## Output: spec.md

```markdown
# Module Spec: [Module Name]

## Bounded Context

- **Subdomain:** [slug]
- **Business Domain:** [e.g. Sales/Order Management]
- **Complexity:** [Low / Medium / High / Very High]
- **Responsibility:** [one sentence — what this subdomain owns and is solely responsible for]
- **Depends on:** [list of subdomains this reads data from, or "none"]
- **Notifies:** [list of subdomains this emits events to, or "none"]
- **Independence check:** [confirm this subdomain can function without calling other subdomains directly]

## Overview

[2–3 sentences. What problem does this solve? Who benefits? What is the scope?]

## Actors and Roles

| Actor | Type | Role in this module |
|-------|------|---------------------|
| [Actor 1] | Human / System / External | [what they do] |

## Triggers

- **[Trigger 1]**: [who or what activates it, under what condition]

## Pre-conditions

- [ ] [What must be true or exist before this module can run]

## Actions

### [Actor name]
- **[Action 1]**: [what they do, on what artifact, with what result]

### System (automatic)
- **[Auto-action 1]**: [what triggers it, what it does]

## Artifacts

| Artifact | Type | Operations | Notes |
|----------|------|------------|-------|
| [Business entity] | Entity | Create / Read / Update / Delete | [constraints] |
| [Report X] | Output | Generate / Export | [format, recipient] |
| [Notification Y] | Output | Send | [channel, trigger] |

## Business Rules

- **BR-01**: [condition → consequence]
- **BR-02**: ...

> Rules are numbered BR-NN so they can be referenced in the BPMN and in code.

## Post-conditions

- [ ] [What this module guarantees after successful execution]

## Assumptions

- *[Something inferred from context — should be validated with the business owner]*

## Open Questions

- [ ] [Decision or information still needed before development can begin]

## Module Dependencies

| Module | Relationship | Detail |
|--------|-------------|--------|
| [Module X] | Depends on | [what it reads from there] |
| [Module Y] | Notifies | [what event it sends there] |
```

---

### Step 6 — Completeness gate

Before closing, verify every item. This gate must pass before `opscale-dbml` can begin.

```
SPEC COMPLETENESS GATE
──────────────────────────────────────────────────────
[ ] Bounded context has slug, Business domain, complexity, responsibility, independence confirmed
[ ] Every actor has at least one action
[ ] Every artifact has its type and operations defined
[ ] All business rules are numbered BR-NN
[ ] Every trigger connects to at least one action or artifact
[ ] Pre-conditions and post-conditions are concrete and verifiable — not vague
[ ] No orphan actions (every action has an actor or a trigger)
[ ] Assumptions and open questions are separated and explicit
[ ] Module dependencies list is complete (even if empty)
──────────────────────────────────────────────────────
STATUS: [ ] PASS — opscale-dbml may proceed
        [ ] FAIL — list blocking items below
```

If the gate fails, list what is missing and ask the user to resolve it before continuing.
Do not proceed to `opscale-dbml` with a failed gate.

---

## Quality Rules

**Content rules:**
1. **No tech language**: No Laravel, Nova, PHP, database tables, or column names. Business document only.
2. **Right granularity**: *"the manager approves an order"* — not *"the system sets the status field to approved"*.
3. **Typed artifacts**: Distinguish between entities (persist in the system), outputs (leave the system), and external inputs (come from outside).
4. **Numbered rules**: `BR-NN` format — every rule must be referenceable from the BPMN and from code.

**Inference rules:**
5. **Preserve** — always keep: original process intent and scope, steps explicitly mentioned, business terminology used by the requester, any industry context provided.
6. **Infer and flag** — add as assumptions: standard industry practices for the identified Business domain, implicit exception flows (e.g. "what if the record doesn't exist"), typical actors for that process type when logic is clear from context.
7. **Never invent** — do not add without explicit user input: specific business rules or thresholds, approval hierarchies or amounts, integration points with systems not mentioned, process variations not described, regulatory requirements not applicable to the stated context.

---

## Opscale Context

Keep these in mind when enriching any module description:

- Does this module behave differently per tenant?
- Are actors internal (staff, system) or external (end users, third-party systems)?
- Does this module produce outputs consumed by other modules (events, reports, notifications)?
- Does it depend on or notify any existing modules in the platform?
- Are there any time-sensitive, irreversible, or high-risk operations that need explicit safeguards?

---

## Reference: Common Business Process Taxonomy

Use this to classify the module in Step 1 and calibrate expected complexity.

| Business Domain | Typical processes |
|------------|------------------|
| **Human Resources** | Onboarding, payroll, time tracking, performance evaluation, leave requests, recruitment, offboarding |
| **Purchasing/Procurement** | Purchase requisition, vendor qualification, RFQ, purchase orders, goods receipt, invoice matching, payment |
| **Sales/Order Management** | Lead qualification, quoting, order processing, credit approval, fulfillment, invoicing, returns |
| **Inventory Management** | Stock receipt, reconciliation, transfers, reorder management, reservations, adjustments, audits |
| **Finance/Accounting** | Invoicing, reconciliation, tax reporting, budget control, expense approval, financial closing, cash flow |
| **Production/Manufacturing** | Production planning, MRP, work orders, quality inspection, BOM management, shop floor control |
| **Quality Control** | Incoming inspection, non-conformance management, CAPA, calibration, audits, complaint handling |
| **Logistics/Distribution** | Warehouse receiving, put-away, order picking, packing, shipping, delivery scheduling, returns |
| **Customer Service** | Ticket management, issue resolution, escalation, SLA tracking, feedback, warranty claims |
| **Project Management** | Initiation, resource allocation, task tracking, milestone tracking, budget monitoring, change requests |
| **Maintenance** | Preventive scheduling, work orders, downtime tracking, spare parts, failure analysis |
| **Regulatory Compliance** | Audit preparation, document control, change control, training records, deviation management |

**Complexity reference:**

| Level | Steps | Actors | Characteristics |
|-------|-------|--------|-----------------|
| **Low** | 3–5 | 1–2 | Simple approval flow, one department |
| **Medium** | 6–10 | 3–5 | Multiple decision points, cross-departmental |
| **High** | 11–20 | 5–8 | Complex approvals, system integrations, validations |
| **Very High** | 20+ | 8+ | Multi-tier approvals, regulatory requirements, multiple integrations |
