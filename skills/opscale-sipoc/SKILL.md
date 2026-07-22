---
name: opscale-sipoc
description: >
  Authors one SIPOC document per businessRuleTask in the BPMN — the bridge
  between BPMN (what) and the future handle() body (how). Step 4 of Plan,
  after opscale-bpmn; eventual consumer is opscale-logic. Trigger: "generate
  the SIPOC", "detail the actions", "describe each action". Use it whenever
  each BPMN businessRuleTask needs its SIPOC detailed, even if just "detail
  the actions". Not for writing the actual handle() code — that's
  opscale-logic.
---

# opscale-sipoc

## Context

### Purpose

For each `businessRuleTask` in the module's BPMN, write a SIPOC document that formalizes:

- **S**uppliers — who/what provides the inputs
- **I**nputs — what enters the Action (becomes `parameters()` in `opscale-logic`)
- **P**rocess — the ordered steps the Action performs (becomes the `handle()` body)
- **O**utputs — what the Action returns (becomes the return-array keys)
- **C**ustomers — who/what consumes the outputs

The SIPOC is **planning**, not code. It captures the business reasoning behind each Action so future readers — humans and AI agents alike — can audit a single Action without loading the whole module. It is the contract that `opscale-logic` materializes into PHP later.

This skill is **Plan #4** (the last Plan step). It runs AFTER `opscale-bpmn` and BEFORE `opscale-logic`. It is irrelevant for **package** and **library** projects — those skip Plan entirely.

### Prerequisites

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | `opscale-process` has been run | `final/process.md` exists | Stop. Run `/opscale-process`. |
| 3 | `opscale-dbml` has been run | `final/domain.dbml` exists | Stop. Run `/opscale-dbml`. |
| 4 | `opscale-bpmn` has been run | `final/process.bpmn` and `final/operations.md` exist and PASS | Stop. Run `/opscale-bpmn`. |

Project type: this skill only applies to **app** and **module** projects. Refuse to run on **package** or **library** projects — they have no BPMN.

### Role & tone

You are a **senior process analyst** who writes tight, unambiguous SIPOC documents — one per Action. Where `opscale-process` only borrows SIPOC-style rigor, this skill applies the SIPOC framework **in full** (Suppliers, Inputs, Process, Outputs, Customers). Your job is to **challenge and validate** until each SIPOC is complete, coherent, and faithful to `final/process.md` + `final/domain.dbml` + `final/process.bpmn`. You do not accept ambiguity — when a source is silent on a step, you **stop and ask** rather than invent. Be firm but didactic when surfacing a gap: name what is missing and propose how to resolve it.

### Language rule — match the input

Detect the language of the process description that feeds this skill (the prose in `final/process.md`, especially the *Narrative* section) and **lock every SIPOC's prose to that language** — section prose, table cells, and the one-sentence Action description.

| If the source is in… | Then write each SIPOC in… |
|---|---|
| Spanish | Spanish |
| English | English |
| Portuguese | Portuguese |
| any other language | that language |

**What stays language-neutral (do NOT translate):**

- Internal IDs: `BR-NN`, and the kebab-case `logic.id` (= filename)
- The SIPOC section headings `Suppliers`, `Inputs`, `Process`, `Outputs`, `Customers`, `Business Rules enforced`, `Failure modes` — `opscale-logic` parses these literal strings
- The Output key `success`, Model class names, and `::run()` composition calls
- Classification symbols: 👤 💻
- Filenames and paths

### Core model — full SIPOC, multiple inputs and outputs (one per BPMN businessRuleTask)

`opscale-process` describes the *whole process*: one end-to-end flow with **exactly one** primary input and **exactly one** primary output. This skill zooms in on a single **Action**, and at this level the SIPOC framework applies without that restriction:

- An Action **can have several Suppliers, several Inputs, several Outputs, and several Customers.** There is no "one primary input / one primary output" rule here — list every input `handle()` consumes and every output it returns.
- `success: bool` is always the first Output row, but it is one of potentially many.

Use the same classification vocabulary as the process description, so the two artifacts read as one methodology.

**Suppliers & Customers** — tag each with exactly one of two actor types. There is **no third category** (no "external" tag, no "third-party" tag — a person is a User regardless of which organization they belong to; a piece of software is a System regardless of where it runs):

| Type | Symbol | Definition |
|---|---|---|
| User | 👤 | A person — staff member, customer, partner, third-party operator. Anyone who interacts with the module through a UI, an API request, an email reply, or any other human channel. |
| System | 💻 | Software — internal service, external SaaS, scheduled job, message queue, database, API. Anything that produces or consumes data without a human in the loop at that step. |

**Supplier vs Mechanism.** The Supplier answers *WHO/WHAT provides the input* — e.g. `👤 Loan officer`, `💻 Credit bureau`. The **How obtained** column answers *BY WHAT MECHANISM the input reaches the Action* — e.g. `user types in form`, `system queries from credit bureau API`, `file upload`, `event payload from upstream task`, `read from Loan model passed in`. Both are required, and they are answering different questions.

**Why:** knowing how each input is obtained surfaces missing UI fields, missing integrations, and missing validation rules **before generation starts** — not after `opscale-ui` runs and discovers no form field for `monthlyIncome`, or after `opscale-logic` runs and finds no HTTP client for the credit-bureau call. Mechanism is what turns abstract Inputs into concrete plumbing decisions.

**Coherence — validated per SIPOC (beyond the structural Phase 3 gate):**

1. **Every Input has a named Supplier** — no "TBD", no "various".
2. **Every Output has a named Customer** — no "TBD".
3. **Every Process step is an observable action that maps to a Business Rule or a concrete effect** — never a vague "process the request".

When a source violates one of these, stop, name what's missing, and resolve it with the user before writing the file.

### Output: File Structure

```
.specify/specs/{NNN}-{module-name}/
├── logs/
│   └── sipoc.md                       ← combined phase-by-phase Q/A across every action
└── final/
    └── actions/
        ├── {kebab-id-1}.sipoc.md
        ├── {kebab-id-2}.sipoc.md
        └── ...
```

**Two output groups:**

- `final/actions/{kebab-id}.sipoc.md` — one file per `businessRuleTask`. Filename is the BPMN `logic.id` value (kebab-case). **Append-only** within an iteration — never overwrite an existing SIPOC silently. Conflicts go to user review.
- `logs/sipoc.md` — a single combined log for the whole run. Each action gets one top-level section (`## Action — {kebab-id}`) containing the Q/A from sub-phases 2.1 (Inputs), 2.2 (Suppliers), 2.3 (Outputs), 2.4 (Customers), 2.5 (Process). Replaced on each re-run of the skill. Use the skeleton at `assets/log-template.md`.

Canonical paths: `references/artifact-paths.md`.

### 7-section output structure (SIPOC file template)

Use **exactly** these section headings (Phase 4 of `opscale-logic` parses them as literal strings):

```markdown
# SIPOC — {Action Name}

**Identifier:** `{kebab-id}`
**BPMN task:** {task name as it appears in final/process.bpmn}
**Subprocess:** {subprocess name from final/operations.md}
**Step:** {business step this Logic decomposes, from final/operations.md}
**Business Rules:** BR-NN, BR-NN
**Composes:** {leaf Actions called via ::run(), or "none"}

{One-sentence description of what the Action does, written for an AI agent
deciding when to invoke it. Becomes `description()` in the PHP class.}

## Suppliers
- {👤 / 💻} {Supplier} — provides {input(s)}

## Inputs
| Input | Source | How obtained | Type | Validation rules | Description |
|-------|--------|--------------|------|------------------|-------------|
| {name} | {👤/💻} {supplier} | {form field / API query / event payload / file upload / passed record / …} | {business-type slug, entity name, or scalar} | {constraints beyond the type} | {one line} |

## Process
1. {verb} {entity}[.{column} → {value}] (BR-NN, if cited)
2. {verb} {entity}[ verify {condition}] (BR-NN, if cited)
3. compose {leaf-action-id}   ← only if this Action composes another
N. return result

## Outputs
| Output key | Type | Description | Consumers |
|------------|------|-------------|-----------|
| success | bool | Whether the operation succeeded | All callers |
| {key} | {type} | {one line} | {👤/💻} {consumer} |

## Customers
- {👤 / 💻} {Consumer} — consumes {output(s)}

## Business Rules enforced
- **BR-NN** — {one-line restatement, as it appears in final/process.md}

## Failure modes
- **Soft failure** (return `['success' => false, 'message' => '...']`): {trigger}
- **Hard failure** (throw): {invalid state, integrity violation, …}
```

### Conflict handling (existing SIPOCs)

If a target SIPOC file already exists when this skill runs:

| Situation | Strategy |
|-----------|----------|
| File is byte-identical to the proposed content | Skip — no action |
| File has extra sections or richer text than the proposed content | **Keep existing** — do not overwrite. Note in the run summary that the SIPOC was preserved. |
| File and proposed content disagree on Inputs/Process/Outputs | **Flag for review** — write the proposed version to `final/actions/{kebab-id}.sipoc.md.opscale-preview` and let the user reconcile manually. Never overwrite silently. |

SIPOCs in `final/actions/` are append-only across iterations. Iteration changes get recorded by `opscale-iterate` (under its own iteration log), not by overwriting the initial SIPOC.

### Domain Rules

1. **One BPMN businessRuleTask = one SIPOC file = one future Action class.** The chain is 1:1:1 across BPMN → SIPOC → code. No merging, no splitting.
2. **The SIPOC is a re-statement of spec + DBML + BPMN — never invention.** If the spec is silent on a step, stop and ask the user. Do not fabricate business logic to fill a SIPOC.
3. **Filename = identifier = `logic.id`** — all three are the same kebab-case string. `opscale-logic` relies on this to locate the SIPOC by Action.
4. **`success: bool` is always the first Output row.** Every Action must return it; this skill enforces it at the document level so `opscale-logic` never has to add it after the fact.
5. **Every Business Rule cited (BR-NN) must exist in `final/process.md`.** A SIPOC that references BR-99 when `final/process.md` only has BR-01..BR-05 fails the validation gate.
6. **Composes references are forward declarations.** A SIPOC may list a leaf Action that has not yet been authored — but the validation gate will fail until that leaf SIPOC also exists. This forces leaf SIPOCs to be authored first.
7. **Append-only across iterations.** When `opscale-iterate` adds a new Action, this skill writes a new SIPOC into `final/actions/`; it never edits an existing one. Refinements to existing Actions are recorded by `opscale-iterate` in its own iteration log.
8. **Never write PHP.** This skill produces only markdown. PHP generation is `opscale-logic`'s job.

## Steps

### Phase 1 — Inventory BPMN tasks (from final/process.bpmn)

Extract every `businessRuleTask` from the module's BPMN (`final/process.bpmn`) and present:

```
SIPOCs to author:

| # | BPMN task name | logic.id (filename) | Subprocess | Business Rules |
|---|----------------|---------------------|------------|----------------|
| 1 | [name]         | [kebab-id]          | [subprocess] | BR-01, BR-02 |
| 2 | [name]         | [kebab-id]          | [subprocess] | BR-03 |

Existing SIPOCs in final/actions/: [list any pre-existing files]
Confirm before authoring?
```

**Wait for user approval before continuing.**

### Phase 2 — Author each SIPOC: Inputs → Suppliers → Outputs → Customers → Process

For each `businessRuleTask` from Phase 1, walk these five sub-phases in order. Each ends in a confirmation gate. The order is intentional: establish *what enters and who provides it*, then *what leaves and who consumes it*, and only at the end pull the **Process** steps from the CRUD composition already locked in `opscale-bpmn` Phase 2.4. Process is **imported, not re-elaborated** — that prevents the BPMN and the SIPOC from drifting.

**2.1 — Inputs + How obtained**

Ask what the Action receives **and by what mechanism each input arrives**. Inputs become `parameters()` in `opscale-logic`.

**Type inputs with business types first.** Resolve each input's type in this order: a **business-type slug** from the central language-agnostic registry (`.specify/memory/business-types.md`, fallback: `references/business-types.md`) → an **entity name** from `final/domain.dbml` (when the input is a whole record; `opscale-logic` resolves the entity to its model class via `final/naming.md`) → a plain scalar. A business type carries its validation semantics implicitly (typing an input `email` means valid-email-format without restating it), so the Validation column only adds constraints the registry doesn't already imply (`required`, cross-field conditions). If the entity column this input feeds carries `// type:{slug}` in the DBML, the input MUST use the same slug — same data, same type, both sides. The SIPOC stays implementation-agnostic: slugs and entity names, never framework classes or rule strings.

```
SIPOC for "[Action Name]" (id: `[kebab-id]`)

What inputs does this Action consume? For each one:
- name and type (business-type slug from the registry, entity name from the DBML, or scalar)
- how it is obtained (form field, API query, event payload, file upload, record passed in, …)
- validation constraints beyond what the business type already implies (required, …)

Draft from BPMN/DBML (the entities this task touches):
| Input | How obtained | Type | Validation |
|-------|--------------|------|------------|
| ...   | ...          | ...  | ...        |

Confirm the input list?
```

Wait for confirmation. No "TBD", no "various" — if the spec/BPMN is silent, **stop and ask**.

**2.2 — Suppliers (derived from inputs)**

Derive who/what provides each input. Every Input from 2.1 traces to a named Supplier tagged with **exactly one of** 👤 user / 💻 system. No other tag is accepted — if a candidate doesn't fit either, stop and re-classify (a "form filled by the customer" is 👤 user; a "webhook delivered by the payment gateway" is 💻 system).

```
Suppliers derived from the 2.1 inputs:

| Input | Supplier | Type |
|-------|----------|------|
| ...   | ...      | 👤/💻 |

As a list:
- 👤/💻 [Supplier 1] — provides [input(s)]
- 👤/💻 [Supplier 2] — provides [input(s)]

Confirm the supplier list?
```

Wait for confirmation.

**2.3 — Outputs**

Ask what the Action returns. `success: bool` is mandatory and always the first row. Outputs become the return-array keys in `handle()`.

```
SIPOC for "[Action Name]" — Outputs

What does this Action return? `success: bool` is the first row always. For each additional output:
- key and type
- one-line description

Draft from the BPMN's downstream connections (next task, gateway, message, sendTask trigger):
| Output key | Type | Description |
|------------|------|-------------|
| success    | bool | Whether the operation succeeded |
| ...        | ...  | ...         |

Confirm the output list?
```

Wait for confirmation.

**2.4 — Customers (derived from outputs)**

Derive who/what consumes each output. Every Output traces to a named Customer tagged with **exactly one of** 👤 user / 💻 system. Same rule as Suppliers — no third category. A notification rendered in an email read by a person is 👤 user; the same notification posted to a webhook another service consumes is 💻 system.

```
Customers derived from the 2.3 outputs:

| Output | Consumer | Type |
|--------|----------|------|
| ...    | ...      | 👤/💻 |

As a list:
- 👤/💻 [Consumer 1] — consumes [output(s)]
- 👤/💻 [Consumer 2] — consumes [output(s)]

Confirm the customer list?
```

Wait for confirmation.

**2.5 — Process (CRUD sequence grouped by Logic) + Rules batch**

The Process section is **the CRUD sequence that the corresponding Logic orchestrates** — nothing more. Open `final/operations.md` and pull the *Composition* CRUD list for this Action's Logic (locked by `opscale-bpmn` Phase 2.4 and persisted there). Never read `logs/bpmn.md` for this — logs are ephemeral and replaced on re-runs; `final/operations.md` is the canonical source. The Process is that list in order: each step is a plain CRUD operation on one entity, written as `{verb} {entity}` with the column or condition that motivates it.

Standard verbs: `create`, `read`, `update`, `delete`. Conditions or column targets are written inline (`update Loan.status → approved`, `read CreditScore verify ≥ 650`). No emoji typing on the CRUDs themselves — the Logic name above the list is what gives them meaning. The last step is always `return result`.

If the Logic depends on another Action (forward composition), add a `compose {leaf-action-id}` line at the position where it runs and list the leaf-action id under **Composes:** in the header.

```
Process for "[Action Name]" — CRUD sequence under this Logic:

1. {verb} {entity}[.{column} → {value}] (BR-NN, if cited)
2. {verb} {entity}[ verify {condition}] (BR-NN, if cited)
3. compose {leaf-action-id}   ← only if this Action composes another
4. return result

Composes: {leaf-action-id, ...}   or "none"

Failure modes:
- Soft failure (return ['success' => false, 'message' => '...']): {trigger}
- Hard failure (throw): {invalid state, integrity violation, …}

Confirm the Process and Failure modes?
```

If the BPMN composition references an entity not in `final/domain.dbml`, or cites a BR not in `final/process.md`, **stop and surface the gap before continuing**. Do not invent business logic — the SIPOC is a re-statement of what's already in spec + DBML + BPMN.

Wait for confirmation. Append the action's Q/A (sub-phases 2.1–2.5) as a new `## Action — {kebab-id}` section in `logs/sipoc.md`, then assemble the file (see template in Context), write it to `final/actions/{kebab-id}.sipoc.md`, and move to the next Action.

**Wait for user approval before continuing.**

### Phase 3 — Validation gate

Run automatically after every SIPOC is written:

```
[ ] One SIPOC per businessRuleTask — file count in final/actions/ matches the Phase 1 inventory
[ ] logs/sipoc.md has one `## Action — {kebab-id}` section per businessRuleTask
[ ] Every SIPOC walked 2.1 (inputs) → 2.2 (suppliers) → 2.3 (outputs) → 2.4 (customers) → 2.5 (process imported from final/operations.md)
[ ] Every SIPOC filename equals the BPMN logic.id (kebab-case, lowercase)
[ ] Every SIPOC has all 7 sections (Identifier block, Suppliers, Inputs, Process, Outputs, Customers, Business Rules, Failure modes)
[ ] Every SIPOC has a one-sentence description after the heading
[ ] Every Input traces to a named, typed Supplier (no "TBD", no "various")
[ ] Every Output traces to a named, typed Customer (no "TBD", no "various")
[ ] Every Process step is a plain CRUD on one entity (or a `compose {leaf-action-id}` call) and traces to an item in the `final/operations.md` composition for this Logic; final step is `return result`
[ ] Every Outputs row includes `success: bool` as the first entry
[ ] Every Business Rule cited (BR-NN) exists in final/process.md and was elicited in BPMN Phase 2.1 for the owning subprocess
[ ] Every "Composes" entry exists as another SIPOC file in final/actions/
[ ] No SIPOC references an entity that doesn't exist in final/domain.dbml
[ ] Every Input type is a business-type slug from the registry, an entity name from final/domain.dbml, or a scalar — never a framework class — and matches the DBML `type:{slug}` note of the column it feeds, when one exists
```

If any check fails, repair the affected SIPOC and re-run the gate before marking the skill complete.

**Smoke gate (MANDATORY before marking the skill complete).** The validation gate covers structural correctness. The smoke gate catches drift between the BPMN and what was actually written:

```bash
SPEC_DIR=$(ls -d .specify/specs/*/ 2>/dev/null | head -1)
[ -n "$SPEC_DIR" ] || { echo "No spec dir found"; exit 1; }

BPMN_COUNT=$(grep -c 'businessRuleTask' "$SPEC_DIR/final/process.bpmn" 2>/dev/null || echo 0)
SIPOC_COUNT=$(ls -1 "$SPEC_DIR/final/actions/"*.sipoc.md 2>/dev/null | wc -l | tr -d ' ')

if [ "$BPMN_COUNT" -ne "$SIPOC_COUNT" ]; then
  echo "BPMN businessRuleTasks ($BPMN_COUNT) != SIPOC files ($SIPOC_COUNT)"
  exit 1
fi
echo "OK $SIPOC_COUNT SIPOCs match $BPMN_COUNT businessRuleTasks"
```

Do NOT mark the skill `PASS` based on file count alone — also verify that **each** SIPOC's `Identifier:` matches the BPMN `logic.id` for the matching task name. Filename match is necessary but not sufficient.

**Wait for user approval before continuing.**

### Phase 4 — Update plan.md

Append a short pointer to `.specify/specs/{NNN}-{module-name}/plan.md`:

```markdown
## SIPOC catalog

| # | Action | Identifier | BPMN task | SIPOC file |
|---|--------|-----------|-----------|-----------|
| 1 | [Name] | `[kebab-id]` | [task] | `final/actions/[kebab-id].sipoc.md` |
| 2 | [Name] | `[kebab-id]` | [task] | `final/actions/[kebab-id].sipoc.md` |
```

This row count must match the count of `businessRuleTask` nodes in the BPMN and the count of files in `final/actions/`. Three places, one number.

**Wait for user approval before continuing.**

## Sample

Full anonymized `.sipoc.md` example — see `references/sample-output.md`.

## Success condition

```bash
node scripts/validate-sipoc.mjs --sipoc-dir=.specify/specs/*/final/actions/
```

Exit code 0 = pass.
