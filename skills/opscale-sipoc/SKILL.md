---
name: opscale-sipoc
description: >
  Authors one SIPOC document per businessRuleTask in the BPMN — the bridge
  between BPMN (what) and the executable body of the generated Action (how).
  Step 4 of Plan, after opscale-bpmn; eventual consumer is opscale-logic.
  Trigger: "generate the SIPOC", "detail the actions", "describe each
  action". Use it whenever each BPMN businessRuleTask needs its SIPOC
  detailed, even if just "detail the actions". Not for writing the Action
  implementation — that's opscale-logic.
---

# opscale-sipoc

## Context

### Purpose

For each `businessRuleTask` in the module's BPMN, write a SIPOC document that formalizes:

- **S**uppliers — who/what provides the inputs
- **I**nputs — what enters the Action (becomes the Action's declared parameters in `opscale-logic`)
- **P**rocess — the ordered steps the Action performs (becomes the executable body of the generated Action)
- **O**utputs — what the Action returns (become the Action's returned output keys)
- **C**ustomers — who/what consumes the outputs

The SIPOC is **planning**, not code. It captures the business reasoning behind each Action so future readers — humans and AI agents alike — can audit a single Action without loading the whole module. It is the contract that `opscale-logic` materializes into code later.

**The set of logic units to document is fixed upstream.** The units are exactly the Logics that emerged from `opscale-bpmn` (grouped in its Phase 2.3, persisted as the `<documentation>` JSON of each `businessRuleTask` in `docs/plan/bpmn.bpmn` — the XML is self-contained). This skill details those units — it never defines new ones, and never merges, splits, or renames them. If a unit is missing or wrong, the fix happens by re-running `opscale-bpmn`, not here.

**Business rules are DEFINED here — the SIPOCs are the module's canonical BR-NN registry.** No earlier artifact numbers or defines business rules: the DBML models data, and `opscale-bpmn` only elicits rules as prose (the `"rules"` array in each `businessRuleTask`'s documentation JSON). This skill takes that prose, challenges and completes it with the user, assigns each rule a **module-unique `BR-NN` number** (numbering is continuous across all the module's SIPOCs — never restarted per file, never duplicated), and writes the **full statement** (condition → consequence) in the owning SIPOC's `## Business Rules enforced` section. A rule enforced by several Actions is defined once (first SIPOC that needs it) and cited by number in the others. Downstream, `opscale-logic` implements the rules from these sections and `opscale-ontology` renders the BR badges from them.

This skill is **Plan #4 of 5**. It runs AFTER `opscale-bpmn` and BEFORE `opscale-ontology` (the Plan closer); its eventual consumer is `opscale-logic`. It is irrelevant for **package** and **library** projects — those skip Plan entirely.

### Prerequisites

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-process` has been run | `docs/plan/process.txt` exists | Stop. Run `/opscale-process`. |
| 2 | `opscale-dbml` has been run | `docs/plan/dbml.dbml` exists | Stop. Run `/opscale-dbml`. |
| 3 | `opscale-bpmn` has been run | `docs/plan/bpmn.bpmn` and `docs/plan/bpmn.txt` exist and PASS (tasks carry their embedded documentation JSON) | Stop. Run `/opscale-bpmn`. |

Project type: this skill only applies to **app** and **module** projects. Refuse to run on **package** or **library** projects — they have no BPMN.

### Modes

The mode depends on whether a writable project folder is available — not on which app is running. A Claude Desktop session may well be opened on a repo folder; `opscale-init` is never a prerequisite.

- **Writable project folder (Claude Code, or Claude Desktop on a repo/folder):** write every output directly to `docs/plan/` as described below.
- **No folder access (chat-only session):** produce exactly the same files as downloadable outputs, each labeled with its destination path (e.g. `docs/plan/sipoc/{kebab-id}.md`), so the user can drop them into the repo afterwards.

The validation gates (Phase 3, the smoke gate, and `scripts/validate-sipoc.mjs`) are **mandatory in both environments** — a console is available in both, and the validator is dependency-free.

**Propose → approve → write → validate.** Nothing is assumed: every phase and sub-phase ends in an explicit user approval, and no artifact is written before the user approved its content in conversation. Validators run after writing; a failed gate is fixed and re-run, never silently patched.

### Role & tone

You are a **senior process analyst** who writes tight, unambiguous SIPOC documents — one per Action. Where `opscale-process` only borrows SIPOC-style rigor, this skill applies the SIPOC framework **in full** (Suppliers, Inputs, Process, Outputs, Customers). Your job is to **challenge and validate** until each SIPOC is complete, coherent, and faithful to `docs/plan/process.txt` + `docs/plan/dbml.dbml` + `docs/plan/bpmn.bpmn`. You do not accept ambiguity — when a source is silent on a step, you **stop and ask** rather than invent. Be firm but didactic when surfacing a gap: name what is missing and propose how to resolve it.

### Language rule — match the input

Detect the language of the flow that feeds this skill (the step lines in `docs/plan/process.txt` and the canonical names in `docs/plan/context/names.md`) and **lock every SIPOC's prose to that language** — section prose, table cells, and the one-sentence Action description.

| If the source is in… | Then write each SIPOC in… |
|---|---|
| Spanish | Spanish |
| English | English |
| Portuguese | Portuguese |
| any other language | that language |

**What stays language-neutral (do NOT translate):**

- Internal IDs: `BR-NN`, and the kebab-case `logic.id` (= filename)
- The SIPOC section headings `Suppliers`, `Inputs`, `Process`, `Outputs`, `Customers`, `Business Rules enforced`, `Failure modes` — `opscale-logic` parses these literal strings
- The Output key `success`, entity names, and Action composition calls
- Classification symbols: 👤 💻
- Filenames and paths

### Core model — full SIPOC, multiple inputs and outputs (one per BPMN businessRuleTask)

`opscale-process` describes the *whole process*: one end-to-end flow with **exactly one** primary input and **exactly one** primary output. This skill zooms in on a single **Action**, and at this level the SIPOC framework applies without that restriction:

- An Action **can have several Suppliers, several Inputs, several Outputs, and several Customers.** There is no "one primary input / one primary output" rule here — list every input the Action consumes and every output it returns.
- `success: bool` is always the first Output row, but it is one of potentially many.

Use the same classification vocabulary as the process description, so the two artifacts read as one methodology.

**Suppliers & Customers** — tag each with exactly one of two actor types. There is **no third category** (no "external" tag, no "third-party" tag — a person is a User regardless of which organization they belong to; a piece of software is a System regardless of where it runs):

| Type | Symbol | Definition |
|---|---|---|
| User | 👤 | A person — staff member, customer, partner, third-party operator. Anyone who interacts with the module through a UI, an API request, an email reply, or any other human channel. |
| System | 💻 | Software — internal service, external SaaS, scheduled job, message queue, database, API. Anything that produces or consumes data without a human in the loop at that step. |

**Suppliers and Customers carry NO identity — only the actor type.** Do not name the person, role, or system: a Supplier row is `👤 User` or `💻 System`, nothing more (not `👤 Loan officer`, not `💻 Credit bureau`). Identifying *who* is an implementation/organization concern that does not belong in the plan; what matters to generation is only whether a human or software sits at that end. The same applies to the Inputs table's **Source** column and the Outputs table's **Consumers** column: `👤` or `💻` only.

**Actor type vs Mechanism.** The Supplier type answers *is a human or software providing this input*. The **How obtained** column answers *BY WHAT MECHANISM the input reaches the Action* — e.g. `user types in form`, `queried from an external API`, `file upload`, `event payload from upstream task`, `read from the record passed in`. Both are required, and they are answering different questions.

**Why:** knowing how each input is obtained surfaces missing UI fields, missing integrations, and missing validation rules **before generation starts** — not after `opscale-ui` runs and discovers no form field for `monthlyIncome`, or after `opscale-logic` runs and finds no HTTP client for the credit-bureau call. Mechanism is what turns abstract Inputs into concrete plumbing decisions.

**Coherence — validated per SIPOC (beyond the structural Phase 3 gate):**

1. **Every Input has a typed Supplier** — `👤 User` or `💻 System`; no "TBD", no "various".
2. **Every Output has a typed Customer** — `👤 User` or `💻 System`; no "TBD".
3. **Every Process step is an observable action that maps to a Business Rule or a concrete effect** — never a vague "process the request".

When a source violates one of these, stop, name what's missing, and resolve it with the user before writing the file.

### Output: File Structure

```
docs/plan/
├── sipoc.txt               ← plain list: each Logic operation → the operations that compose it
└── sipoc/
    ├── {kebab-id-1}.md
    ├── {kebab-id-2}.md
    └── ...
```

**Two output groups:**

- `docs/plan/sipoc/{kebab-id}.md` — one file per `businessRuleTask`. Filename is the BPMN `logic.id` value (kebab-case). **Append-only** within an iteration — never overwrite an existing SIPOC silently. Conflicts go to user review.
- `docs/plan/sipoc.txt` — the plain, parseable composition list (no markdown): each Logic operation on its own line (`{name} ({kebab-id})`), each operation that composes it below prefixed with `- `, one blank line between Logics:

  ```
  Publish article (publish-article)
  - read review_checklist (verify all complete)
  - update articles.status → published

  Submit for review (submit-for-review)
  - update articles.status → reviewing
  - create review_checklist
  ```

  One block per `businessRuleTask`, matching each SIPOC's Process section line for line (minus `return result`). **Why:** gates compare this file against `docs/plan/bpmn.txt` and the XML's `"composed"` arrays **by unique logic ids and composed-member counts** — not by literal text: `bpmn.txt` lines carry oids and `crud:`/`output:` prefixes, while these lines carry the operational detail (`update articles.status → published`) that belongs in the SIPOC. That count-based comparison catches BPMN ↔ SIPOC drift cheaply. Rewritten from all SIPOCs on every run.

Canonical paths: `references/artifact-paths.md`.

### Output structure (SIPOC file template)

Use **exactly** these section headings (Phase 4 of `opscale-logic` parses them as literal strings). The document opens with a **one-glance `## SIPOC` summary table**, then the detailed sections:

```markdown
# SIPOC — {Action Name}

**Identifier:** `{kebab-id}`
**Operation:** `{oid}` — the "oid" key of this task's documentation JSON (SP-XX-YY-LZZ)
**BPMN task:** {task name as it appears in docs/plan/bpmn.bpmn}
**Subprocess:** {the "subprocess" key of this task's documentation JSON in bpmn.bpmn}
**Step:** {the "step" key of this task's documentation JSON in bpmn.bpmn}
**Business Rules:** BR-NN, BR-NN
**Composes:** {leaf Actions this Logic invokes, or "none"}

{One-sentence description of what the Action does, written for an AI agent
deciding when to invoke it. Becomes the generated Action's description.}

## SIPOC

| Suppliers | Inputs | Process | Outputs | Customers |
|---|---|---|---|---|
| {👤 \| 💻} | {input name} | {category}: {operation} | {output key} | {👤 \| 💻 \| All callers} |

One row per element, filled independently per column (leave a cell blank when a
column has fewer elements). It is a **summary** — the detail lives in the
sections below. The **Process column lists this Logic's operations**, one per
row, each prefixed with its category — `crud: {action} {entity}`,
`logic: {leaf-action-id}` (when it composes another Action), or
`output: {brief content}` — the same composed members carried in `bpmn.bpmn`
and expanded in `## Process`. Suppliers/Customers are the actor tags only
(`👤`/`💻`, `All callers` for `success`); Inputs/Outputs list the name/key.

## Suppliers
- {👤 User | 💻 System} — provides {input(s)}

## Inputs
| Input | Source | How obtained | Type | Validation rules | Description |
|-------|--------|--------------|------|------------------|-------------|
| {name} | {👤 \| 💻} | {form field / API query / event payload / file upload / passed record / …} | {business-type slug, entity name, or scalar} | {constraints beyond the type} | {one line} |

## Process
1. {verb} {entity}[.{column} → {value}] (BR-NN, if cited)
2. {verb} {entity}[ verify {condition}] (BR-NN, if cited)
3. compose {leaf-action-id}   ← only if this Action composes another
N. return result

## Outputs
| Output key | Type | Description | Consumers |
|------------|------|-------------|-----------|
| success | bool | Whether the operation succeeded | All callers |
| {key} | {business-type slug \| entity \| Enum} | {one line} | {👤 \| 💻} |

## Customers
- {👤 User | 💻 System} — consumes {output(s)}

## Business Rules enforced
- **BR-NN** — {full statement: condition → consequence. Defined HERE (module-unique numbering across all SIPOCs); rules defined in another SIPOC are cited by number with a short recap}

## Failure modes
- **Soft failure** (returns `success=false` + `message`): {trigger}
- **Hard failure** (throws): {invalid state, integrity violation, …}
```

### Conflict handling (existing SIPOCs)

If a target SIPOC file already exists when this skill runs:

| Situation | Strategy |
|-----------|----------|
| File is byte-identical to the proposed content | Skip — no action |
| File has extra sections or richer text than the proposed content | **Keep existing** — do not overwrite. Note in the run summary that the SIPOC was preserved. |
| File and proposed content disagree on Inputs/Process/Outputs | **Flag for review** — write the proposed version to `docs/plan/sipoc/{kebab-id}.md.opscale-preview` and let the user reconcile manually. Never overwrite silently. |

SIPOCs in `docs/plan/sipoc/` are append-only across iterations. Iteration changes get recorded by `opscale-iterate` (under its own iteration log), not by overwriting the initial SIPOC.

### Domain Rules

1. **One BPMN businessRuleTask = one SIPOC file = one future Action class.** The chain is 1:1:1 across BPMN → SIPOC → code (unique `logic.id`s — a reused id is still one SIPOC). No merging, no splitting. The unit list comes from the previous step — the Logics locked by `opscale-bpmn` in the XML's embedded documentation JSON — and this skill never adds, drops, or renames a unit; a wrong list is fixed by re-running `opscale-bpmn`.
2. **The SIPOC is a re-statement of spec + DBML + BPMN — never invention.** If the spec is silent on a step, stop and ask the user. Do not fabricate business logic to fill a SIPOC.
3. **Filename = identifier = `logic.id`** — all three are the same kebab-case string. `opscale-logic` relies on this to locate the SIPOC by Action.
4. **`success: bool` is always the first Output row.** Every Action must return it; this skill enforces it at the document level so `opscale-logic` never has to add it after the fact.
5. **Every Business Rule cited (BR-NN) must be defined in exactly one SIPOC's `Business Rules enforced` section.** The SIPOCs are the module's canonical BR registry: numbering is module-unique and continuous; a cited-but-nowhere-defined BR-NN, or the same number defined twice with different statements, fails the gate.
6. **Composes references are forward declarations.** A SIPOC may list a leaf Action that has not yet been authored — but the validation gate will fail until that leaf SIPOC also exists. This forces leaf SIPOCs to be authored first. Every `compose` traces to a Logic-reference member (`{"oid","id"}`) in the BPMN's `"composed"` array, and the leaf Action is always its own `businessRuleTask` node with its own SIPOC — composition reuses units, it never creates them.
7. **Append-only across iterations.** When `opscale-iterate` adds a new Action, this skill writes a new SIPOC into `docs/plan/sipoc/`; it never edits an existing one. Refinements to existing Actions are recorded by `opscale-iterate` in its own iteration log.
8. **Never write implementation code.** This skill produces only markdown. Code generation is `opscale-logic`'s job.

## Steps

### Phase 1 — Inventory the Logic units locked by opscale-bpmn (from the XML's embedded metadata)

The units to detail are **not elicited in this skill** — they are the Logics that surged from the previous step. Build the inventory from `docs/plan/bpmn.bpmn`: one row per **unique** `logic.id` among the `businessRuleTask` nodes, reading each one's `<documentation>` JSON (name from the task, `id`, `subprocess`, `step`, `rules`, `composed`).

Then cross-check against `docs/plan/bpmn.txt`: every unique logic id in the XML must appear as a `- logic: {Name} ({id})` line there, and vice versa — 1:1, no leftovers on either side. On any mismatch, **stop and send the user back to `/opscale-bpmn`**; the unit list is repaired there, never patched here.

Present:

```
SIPOCs to author (source: the businessRuleTask documentation JSON in docs/plan/bpmn.bpmn, cross-checked 1:1 against docs/plan/bpmn.txt):

| # | Logic (BPMN task name) | logic.id (filename) | Subprocess | Business Rules |
|---|------------------------|---------------------|------------|----------------|
| 1 | [name]                 | [kebab-id]          | [subprocess] | BR-01, BR-02 |
| 2 | [name]                 | [kebab-id]          | [subprocess] | BR-03 |

Existing SIPOCs in docs/plan/sipoc/: [list any pre-existing files]
Confirm before authoring?
```

**Wait for user approval before continuing.**

### Phase 2 — Author each SIPOC: Inputs → Suppliers → Outputs → Customers → Process

For each `businessRuleTask` from Phase 1, walk these five sub-phases in order. Each ends in a confirmation gate. The order is intentional: establish *what enters and who provides it*, then *what leaves and who consumes it*, and only at the end pull the **Process** steps from the CRUD composition already locked in `opscale-bpmn` Phase 2.4. Process is **imported, not re-elaborated** — that prevents the BPMN and the SIPOC from drifting.

**2.1 — Inputs + How obtained**

Ask what the Action receives **and by what mechanism each input arrives**. Inputs become the Action's declared parameters in `opscale-logic`.

**Every Input and Output is typed with a business type — no free scalars.** Resolve each type in this order: a **business-type slug** from the central language-agnostic registry (`docs/plan/context/business-types.md`; if the project copy does not exist yet — e.g. Plan running without `opscale-init` — copy it there from this skill's `references/business-types.md` first) → an **entity name** from `docs/plan/dbml.dbml` (when the value is a whole record; `opscale-logic` resolves the entity to its generated class via its kebab id: the table Note's opening kebab matches the `@entity` docblock of exactly one model) → an **Enum declared in the DBML** (when the value is one of its cases). **There is no other option**: `object`, `array`, `string`, `int`, `float`, `json`, `mixed` are forbidden in the Type column — if nothing fits, extend the project registry first (that is the point of a central registry). The single exception is the mandatory first Output row `success: bool`. A business type carries its validation semantics implicitly (typing an input `email` means valid-email-format without restating it), so the Validation column only adds constraints the registry doesn't already imply (`required`, cross-field conditions). Since the DBML's column types ARE the slugs, an input that feeds a column simply reuses that column's declared type — same data, same type, both sides. The SIPOC stays implementation-agnostic: slugs, entity names, and Enum names — never framework classes or rule strings.

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

Ask what the Action returns. `success: bool` is mandatory and always the first row. Outputs become the Action's returned output keys.

```
SIPOC for "[Action Name]" — Outputs

What does this Action return? `success: bool` is the first row always. For each additional output:
- key and type — same typing rule as Inputs: a business-type slug from the registry, an entity name from the DBML, or an Enum declared in the DBML; never `object`/free scalars
- one-line description

Draft from the BPMN's downstream connections (next task, gateway, the Outputs this Logic composes):
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

The Process section is **the CRUD sequence that the corresponding Logic orchestrates** — nothing more. Pull the `"composed"` array from this Logic's `businessRuleTask` `<documentation>` JSON in `docs/plan/bpmn.bpmn` (locked by `opscale-bpmn` Phase 2.4 and embedded there — the diagram is the canonical source; `docs/plan/bpmn.txt` shows the same list readably). The Process is that list in order: each step is a plain CRUD operation on one entity, written as `{verb} {entity}` with the column or condition that motivates it.

Standard verbs: `create`, `read`, `update`, `delete`. Conditions or column targets are written inline (`update Loan.status → approved`, `read CreditScore verify ≥ 650`). No emoji typing on the CRUDs themselves — the Logic name above the list is what gives them meaning. The last step is always `return result`.

If the Logic depends on another Action (forward composition), add a `compose {leaf-action-id}` line at the position where it runs and list the leaf-action id under **Composes:** in the header. Each `compose` line corresponds 1:1 to a **Logic-reference member** (`{"oid":"…-LAA","id":"{leaf-kebab-id}"}`) of this task's `"composed"` array in `docs/plan/bpmn.bpmn` — if the reference is not there, the fix happens by re-running `/opscale-bpmn`, never by adding it here.

```
Process for "[Action Name]" — CRUD sequence under this Logic:

1. {verb} {entity}[.{column} → {value}] (BR-NN, if cited)
2. {verb} {entity}[ verify {condition}] (BR-NN, if cited)
3. compose {leaf-action-id}   ← only if this Action composes another
4. return result

Composes: {leaf-action-id, ...}   or "none"

Failure modes:
- Soft failure (returns success=false + message): {trigger}
- Hard failure (throws): {invalid state, integrity violation, …}

Confirm the Process and Failure modes?
```

If the BPMN composition references an entity not in `docs/plan/dbml.dbml`, or cites a rule with no counterpart in that task's `"rules"` array in `docs/plan/bpmn.bpmn`, **stop and surface the gap before continuing**. Do not invent business logic — the SIPOC is a re-statement of what's already in spec + DBML + BPMN.

Wait for confirmation. Assemble the file (see template in Context) — including the leading **`## SIPOC` summary table**, built mechanically from the four already-confirmed sections (Suppliers/Customers actor tags, Input names, Output keys) with the **Process column carrying this Logic's operations** (`crud:` / `logic:` / `output:`, one per row, the same composed members as `## Process`). Write it to `docs/plan/sipoc/{kebab-id}.md`, and move to the next Action. After the last Action, regenerate `docs/plan/sipoc.txt` from all SIPOCs' Process sections (format in Context).

**Wait for user approval before continuing.**

### Phase 3 — Validation gate

Run automatically after every SIPOC is written:

```
[ ] Phase 1 inventory sourced from the businessRuleTask documentation JSON in docs/plan/bpmn.bpmn (Logics locked by opscale-bpmn) and 1:1 with the `- logic:` blocks of docs/plan/bpmn.txt
[ ] One SIPOC per Logic unit — file count in docs/plan/sipoc/ matches the Phase 1 inventory
[ ] Every SIPOC walked 2.1 (inputs) → 2.2 (suppliers) → 2.3 (outputs) → 2.4 (customers) → 2.5 (process imported from the XML's "composed" array)
[ ] Every SIPOC filename equals the BPMN logic.id (kebab-case, lowercase)
[ ] Every SIPOC has the identifier block, the `## SIPOC` summary table, and all detailed sections (Suppliers, Inputs, Process, Outputs, Customers, Business Rules enforced, Failure modes)
[ ] The `## SIPOC` table's Process column lists this Logic's operations, each prefixed `crud:` / `logic:` / `output:` (matching the composed members)
[ ] Every SIPOC has a one-sentence description after the heading
[ ] Every Input traces to a named, typed Supplier (no "TBD", no "various")
[ ] Every Output traces to a named, typed Customer (no "TBD", no "various")
[ ] Every Process step is a plain CRUD on one entity (or a `compose {leaf-action-id}` call) and traces to an item in this Logic's "composed" array in docs/plan/bpmn.bpmn (a `compose` traces to a Logic-reference member {"oid","id"}); final step is `return result`
[ ] Every Outputs row includes `success: bool` as the first entry
[ ] Every Business Rule cited (BR-NN) is defined in exactly one SIPOC's `Business Rules enforced` section (module-unique, continuous numbering) and traces to a prose rule in some businessRuleTask's "rules" array in docs/plan/bpmn.bpmn (elicited in BPMN Phase 2.1)
[ ] Every "Composes" entry exists as another SIPOC file in docs/plan/sipoc/
[ ] No SIPOC references an entity that doesn't exist in docs/plan/dbml.dbml
[ ] Every Input AND Output type is a business-type slug from the registry, an entity name from docs/plan/dbml.dbml, or an Enum declared there — never `object`/`array`/free scalars (only `success: bool` is exempt) — and matches the declared DBML column type it feeds, when one exists
[ ] docs/plan/sipoc.txt written — one block per businessRuleTask, each block matching its SIPOC's Process section (minus `return result`)
```

If any check fails, repair the affected SIPOC and re-run the gate before marking the skill complete.

**Smoke gate (MANDATORY before marking the skill complete).** The validation gate covers structural correctness. The smoke gate catches drift between the Logic units locked by `opscale-bpmn` and what was actually written — a three-way count: unique `- logic:` ids in `bpmn.txt` = **unique** BPMN logic ids = SIPOC files. Both BPMN-side counts use unique `logic.id` values, never raw occurrences: the same Logic may appear as several nodes (reused across branches — e.g. `discard-candidate` reachable from three gateways), so a raw count always overshoots:

```bash
PLAN_DIR=docs/plan
[ -d "$PLAN_DIR" ] || { echo "No docs/plan directory found"; exit 1; }

TXT_COUNT=$(grep -E '^- SP-[0-9-]+-L[0-9]+ logic:' "$PLAN_DIR/bpmn.txt" 2>/dev/null | awk '{print $NF}' | sort -u | wc -l | tr -d ' ')
BPMN_COUNT=$(grep -o '"type":"logic","oid":"[^"]*","id":"[a-z0-9-]*"' "$PLAN_DIR/bpmn.bpmn" 2>/dev/null | sed 's/.*"id":"//; s/"$//' | sort -u | wc -l | tr -d ' ')
SIPOC_COUNT=$(ls -1 "$PLAN_DIR/sipoc/"*.md 2>/dev/null | wc -l | tr -d ' ')

if [ "$TXT_COUNT" -ne "$BPMN_COUNT" ] || [ "$BPMN_COUNT" -ne "$SIPOC_COUNT" ]; then
  echo "bpmn.txt logic ids ($TXT_COUNT) != unique BPMN logic ids ($BPMN_COUNT) != SIPOC files ($SIPOC_COUNT)"
  echo "Unit-list mismatches are fixed in /opscale-bpmn, not by adding/removing SIPOCs."
  exit 1
fi
echo "OK $SIPOC_COUNT SIPOCs match $TXT_COUNT bpmn.txt logic ids and $BPMN_COUNT unique BPMN logic ids"
```

Do NOT mark the skill `PASS` based on file count alone — also verify that **each** SIPOC's `Identifier:` matches the BPMN `logic.id` for the matching task name. Filename match is necessary but not sufficient.

**Wait for user approval before continuing.**

## Sample

Full SIPOC example (`docs/plan/sipoc/activate-supplier.md`) and a full reference `docs/plan/sipoc.txt` (Proveedores module — supplier master lifecycle, shared across the five Plan skills — one block per logic id in `bpmn.txt`) — see `references/sample-output.md`.

## Success condition

```bash
node scripts/validate-sipoc.mjs --sipoc-dir=docs/plan/sipoc
```

Exit code 0 = pass.
