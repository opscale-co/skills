---
name: opscale-process
description: >
  Enriches a casual or informal description of a business process into a structured
  process specification — a BPMN-style prose flow where everything follows a
  sequence and any non-sequential behavior is modeled as an event — and writes it
  to the spec-kit path ready for downstream skills. Use this skill whenever the
  user describes a process, workflow, or operation — even as a quick sentence
  like "we need to handle overdue payments" — and needs it converted into a
  complete spec with actors, sequential steps, events, gateways, artifacts,
  business rules, pre-conditions, and post-conditions. This is Step 1 in the
  Opscale sequence and must run BEFORE opscale-dbml or any subsequent step. Also
  trigger when the user says "I want to spec a process", "help me think through
  this workflow", "let's define this process", or presents a vague idea that
  needs business context before anything else can begin.
---

# opscale-process

## Prerequisites — MUST be satisfied before this skill runs

| Requirement | Check | If missing |
|-------------|-------|-----------|
| `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Tell the user: "Run `/opscale-init` first — `.specify/memory/constitution.md` is missing." |

This skill is **Step 1 of the Plan phase**. It does not run standalone.

## Purpose

Turn a rough, casual description of a process into two things:

1. A **bounded context definition** — the subdomain contract used by all downstream skills
2. A **process spec** — a plain-language document that reads like a BPMN in prose: a sequence of steps performed by actors on artifacts, with explicit events whenever the flow is not strictly sequential (waits, decisions, parallel paths, interruptions, exceptions, timers)

Both are written to `.specify/specs/{NNN}-{process-name}/spec.md`.

The user will speak in everyday operational terms. *"we need something to track overdue payments"* is a valid input. The skill bridges that gap without making the user think in flowcharts — it does the structuring.

---

## Core modeling principle — sequence first, events for everything else

The process spec is a **prose BPMN**. The default unit is a numbered **Step** that flows into the next Step. When the flow cannot continue purely as `Step N → Step N+1`, the cause must be made explicit as one of:

| Construct | When to use it |
|-----------|---------------|
| **Start Event** | The trigger that begins the process (manual, scheduled, message from another process, condition met) |
| **Intermediate Event** | The process waits for something to happen before continuing — a timer, an external message, a signal, an approval, a document arriving |
| **End Event** | A terminal state of the process — successful completion, cancellation, rejection, error termination |
| **Gateway (Decision)** | The flow branches based on a condition — each outgoing path must be named and connect to a downstream Step or Event |
| **Gateway (Parallel)** | Two or more sub-flows happen at the same time and must rejoin before continuing |
| **Boundary Event** | A Step can be interrupted by something external (a cancellation, a timeout, an error) — declare it on the Step it attaches to |

If a description sounds like *"meanwhile…"*, *"if X then…"*, *"otherwise…"*, *"as soon as…"*, *"after N days…"*, *"unless…"* — that is a signal that an Event or Gateway is required, not a hidden Step.

Every Step, Event, and Gateway gets an ID so it can be referenced from business rules and from the BPMN diagram later: `S-01`, `E-01`, `G-01`, `B-01`.

---

## Output Location

```
.specify/specs/{NNN}-{process-name}/
├── spec.md             ← structured process spec (this skill's primary output)
└── docs/
    └── process.md      ← original narrative description, as supplied by the user
```

Where `{NNN}` is the next available three-digit number in `.specify/specs/` (e.g. `001`, `002`).
Where `{process-name}` is a short kebab-case name derived from the description (e.g. `order-fulfillment`, `invoice-collection`).

**Two artifacts, two purposes:**
- `spec.md` — the structured spec used by every downstream skill. Sequence of Steps, Events, Gateways, actors, artifacts, business rules, pre/post conditions.
- `docs/process.md` — the original informal description the user provided (or the cleaned-up narrative of it). This is the human-readable story; downstream skills do not parse it, but it is what humans read first when onboarding to the process. Preserve the user's wording when possible — minimal editing.

If `.specify/` does not exist, ask the user if they want to initialize it now.
If yes, run the `opscale-init` workflow inline before continuing.
If no, stop and explain that `.specify/` is required for spec-driven work.

---

## Workflow

### Step 1 — Read and classify the input

Accept any form of input:
- A single sentence: *"a process to manage customer orders"*
- A paragraph with scattered ideas
- A partial doc or copy-paste from a chat

Extract: what outcome the process produces, who is involved, what actions are mentioned, what is created/consumed/handed over.

Then map the process to the most likely **Business domain** (see Reference: Common Business Process Taxonomy below).
This classification drives complexity expectations and helps infer standard actors, events, and exception paths that are typical for that domain.

---

### Step 2 — Ground with a real-world reference (if input is very brief)

If the input is a single sentence or lacks enough context to identify actors and artifacts,
ask one grounding question:

> *"To make sure I get this right — is this similar to how [familiar example] works?
> Like how [well-known operation] handles [process type]?"*

Use the business process taxonomy to suggest a concrete reference that matches the identified domain.
Skip this step if the input already has enough context.

---

### Step 3 — Identify gaps

Map what is missing across the seven required categories. If critical gaps exist, ask
**one focused batch of questions** — not one at a time, not a wall of ten. Keep the tone conversational.

| Category | Key questions |
|----------|--------------|
| **Actors** | Who participates? Who approves? Are there roles that act automatically (a clock, a rule, an external party)? |
| **Steps** | What does each actor do, in what order? What is the main sequence end-to-end? |
| **Events** | What starts the process? What does the process wait for at any point? What ends it (success, cancellation, exception)? |
| **Gateways** | Where does the flow branch? Where do parallel paths exist? Where can a Step be interrupted? |
| **Artifacts** | What is created, read, modified, exchanged, or delivered along the way? |
| **Business rules** | What conditions must hold? What thresholds, deadlines, or restrictions apply? |
| **Pre/Post conditions** | What must be true before the process begins? What is guaranteed after it ends? |

When inferring missing details, apply the **inference rules** from Quality Rules below.
If enough context exists to make reasonable inferences, proceed and flag them as assumptions.

---

### Step 4 — Confirm approach before writing

Before generating the full spec, present a brief summary:

```
Before I write the spec, here's what I'm working with:

- **Process name:** [proposed name]
- **Subdomain:** [slug]
- **Business domain:** [e.g. Sales/Order Management, Finance/Accounting]
- **Complexity:** [Low / Medium / High / Very High — see complexity reference]
- **Start trigger:** [what kicks off the process]
- **Main actor:** [who drives the sequence]
- **Other actors:** [list]
- **Expected end states:** [success / cancellation / exception]
- **Core outcome:** [one sentence — what the process produces or guarantees]
- **Depends on:** [other processes whose outcomes this one consumes, or "none"]
- **Notifies:** [other processes this one signals, or "none"]
- **Key assumptions:** [2-3 bullets]
- **Open questions:** [anything that blocks completeness]

Does this match what you have in mind?
```

Adjust based on feedback, then proceed.

---

### Step 5 — Write the narrative AND the spec

Write **two files** in this order:

**5a. `.specify/specs/{NNN}-{process-name}/docs/process.md`** — the narrative.

This file preserves the original informal description that started the process.
Structure:

```markdown
# [Process Name] — Process Narrative

> Captured: [YYYY-MM-DD]
> Source: [user conversation / pasted doc / chat thread / etc.]

## Original description

[The user's input verbatim, lightly cleaned for readability — fix obvious typos
and split walls-of-text into paragraphs, but keep their wording, their
priorities, and any informal phrasing. Do NOT rewrite as a structured spec —
that is what spec.md is for.]

## Inferred business domain

[Domain from Step 1 — Sales / Finance / HR / etc.]

## Identified actors (from the narrative)

- [Actor 1] — [how they appeared in the description]

## Open questions left for spec.md

- [Question the user did not answer that the structured spec had to assume or flag]
```

**5b. `.specify/specs/{NNN}-{process-name}/spec.md`** — the structured spec.

Write the full structured document. Language must be **plain and business-focused** — describe what people and roles do, what documents and items flow between them, what events the process waits on. Scale detail to the complexity level identified in Step 4.

---

## Output: spec.md

```markdown
# Process Spec: [Process Name]

## Bounded Context

- **Subdomain:** [slug]
- **Business Domain:** [e.g. Sales/Order Management]
- **Complexity:** [Low / Medium / High / Very High]
- **Responsibility:** [one sentence — what this subdomain owns and is solely responsible for]
- **Depends on:** [list of subdomains whose outcomes this one consumes, or "none"]
- **Notifies:** [list of subdomains this one signals, or "none"]
- **Independence check:** [confirm this subdomain can run without reaching into other subdomains directly]

## Overview

[2–3 sentences. What outcome does this process produce? Who benefits? What is in scope and what is out of scope?]

## Actors and Roles

| Actor | Type | Role in this process |
|-------|------|---------------------|
| [Actor 1] | Human / Automated / External | [what they do across the flow] |

## Artifacts

Things that flow through, are produced by, or are consumed by the process.

| Artifact | Type | Role | Notes |
|----------|------|------|-------|
| [Entity] | Entity | Created / Read / Updated / Closed | [constraints] |
| [Document] | Output | Produced and delivered to [recipient] | [format, channel] |
| [Signal] | External input | Received from [source] | [when, how] |

## Pre-conditions

- [ ] [What must be true before the process can begin — concrete and verifiable]

## Process Flow

> Sequence first. Whenever the flow is not strictly `S-N → S-N+1`, declare an Event or a Gateway. Every node has an ID so business rules and downstream skills can reference it.

### Start Event — E-00 — [Name]
- **Triggered by:** [manual action by Actor / scheduled time / arrival of external signal / condition becoming true]
- **Flows to:** S-01

### Step S-01 — [Name]
- **Actor:** [who performs this Step]
- **Action:** [what they do — plain language, no jargon]
- **Inputs:** [artifacts read]
- **Outputs:** [artifacts created or updated]
- **Governed by:** [BR-NN, BR-NN]
- **Flows to:** S-02

### Step S-02 — [Name]
- **Actor:** …
- **Action:** …
- **Flows to:** G-01

### Gateway G-01 — Decision — [question being decided]
- If **[condition A]** → S-03
- If **[condition B]** → E-90 (End — [reason])
- **Governed by:** BR-NN

### Intermediate Event E-01 — Wait — [what the process is waiting for]
- **Waits for:** [external message / signal / approval / document / a deadline]
- **On occurrence:** → S-04
- **If timeout (BR-NN):** → S-05 or E-91

### Gateway G-02 — Parallel split
- Branch A: S-06 → S-07
- Branch B: S-08
- Both branches must complete, then → S-09

### Step S-09 — [Name]
- **Boundary Event B-01:** if [interruption — cancellation / error / external signal] occurs while this Step is active, the Step is interrupted and the flow goes to E-92.
- **Actor:** …
- **Action:** …
- **Flows to:** E-99

### End Event E-99 — Success — [final state]
- **Process ends when:** [the outcome described in the Overview is achieved]
- **Guarantees:** [post-conditions verified]

### End Event E-90 / E-91 / E-92 — [Cancellation / Timeout / Exception]
- **Process ends when:** [non-success terminal state]
- **State of artifacts on termination:** [what remains, what is discarded, what is preserved]

## Business Rules

- **BR-01**: [condition → consequence] — applied at [S-NN / G-NN / E-NN]
- **BR-02**: …

> Rules are numbered BR-NN so they can be referenced from the flow above, from the BPMN, and later from any implementation.

## Post-conditions

- [ ] [What this process guarantees after reaching a success End Event]

## Assumptions

- *[Something inferred from context — should be validated with the business owner]*

## Open Questions

- [ ] [Decision or information still needed before anything downstream can begin]

## Process Dependencies

| Process | Relationship | Detail |
|---------|-------------|--------|
| [Process X] | Depends on | [what outcome it consumes from there] |
| [Process Y] | Notifies | [what signal it sends there, from which Event] |
```

---

### Step 6 — Completeness gate

Before closing, verify every item. This gate must pass before `opscale-dbml` can begin.

```
SPEC COMPLETENESS GATE
──────────────────────────────────────────────────────
[ ] docs/process.md written (narrative preserved)
[ ] spec.md written
[ ] Bounded context has slug, Business domain, complexity, responsibility, independence confirmed
[ ] Exactly one Start Event is defined (E-00)
[ ] At least one Success End Event is defined; non-success End Events listed where applicable
[ ] Every Step has an actor, an action, and a "Flows to" pointer
[ ] Every Gateway names each outgoing path and points to a Step or Event
[ ] Every Intermediate Event states what it waits for and where it goes on occurrence (and on timeout, if applicable)
[ ] Every Boundary Event is attached to a Step and points to an End or recovery Step
[ ] The flow has no dead ends — every node reaches an End Event
[ ] Every actor performs at least one Step or triggers at least one Event
[ ] Every artifact has its type and role defined
[ ] All business rules are numbered BR-NN and each one references the node it governs
[ ] Pre-conditions and post-conditions are concrete and verifiable — not vague
[ ] Assumptions and open questions are separated and explicit
[ ] Process dependencies list is complete (even if empty)
──────────────────────────────────────────────────────
STATUS: [ ] PASS — opscale-dbml may proceed
        [ ] FAIL — list blocking items below
```

If the gate fails, list what is missing and ask the user to resolve it before continuing.
Do not proceed to `opscale-dbml` with a failed gate.

---

## Quality Rules

**Content rules:**
1. **Business language only**: describe what people and roles do, what documents and items move between them, what the process waits on. No references to code, databases, screens, fields, or any implementation concern.
2. **Right granularity**: *"the manager approves the order"* — not *"the approval flag is set to true"*. A Step is something a real participant would recognize as one thing they do.
3. **Typed artifacts**: distinguish between entities (things the process keeps track of), outputs (things the process produces and delivers), and external inputs (things that arrive from outside).
4. **Numbered nodes and rules**: `S-NN` for Steps, `E-NN` for Events, `G-NN` for Gateways, `B-NN` for Boundary Events, `BR-NN` for business rules. Every business rule must reference the node(s) it governs.
5. **Sequence is the default**: if two Steps run one after the other, just chain them. Only introduce a Gateway or Event when the flow is genuinely not sequential.
6. **Non-sequential = event or gateway**: any *"meanwhile"*, *"if/else"*, *"as soon as"*, *"after N days"*, *"unless"*, *"otherwise"* in the description must surface as a named Event or Gateway in the spec — never as buried prose inside a Step.

**Inference rules:**
7. **Preserve** — always keep: original process intent and scope, steps explicitly mentioned, terminology used by the requester, any industry context provided.
8. **Infer and flag** — add as assumptions: standard practices for the identified Business domain, implicit exception paths (e.g. "what if the document never arrives"), typical actors and Events for that process type when the logic is clear from context.
9. **Never invent** — do not add without explicit user input: specific thresholds, approval hierarchies or amounts, integrations with parties not mentioned, process variations not described, regulatory requirements not applicable to the stated context.

---

## Reference: Common Business Process Taxonomy

Use this to classify the process in Step 1 and calibrate expected complexity.

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
| **Low** | 3–5 | 1–2 | Mostly linear, one or two events, single department |
| **Medium** | 6–10 | 3–5 | Multiple decision gateways, at least one wait event, cross-departmental |
| **High** | 11–20 | 5–8 | Several gateways, parallel paths, boundary events for interruptions, multiple end states |
| **Very High** | 20+ | 8+ | Multi-tier approvals, regulatory checkpoints, multiple parallel sub-flows, several non-success end states |
