---
name: opscale-sipoc
description: >
  Authors one SIPOC document per businessRuleTask in the BPMN — the bridge
  between BPMN (what) and the future handle() body (how). Step 4 of Plan —
  runs after opscale-bpmn, before opscale-domain. Trigger: "generate the
  SIPOC", "detail the actions", "describe each action".
  Use it whenever each BPMN businessRuleTask needs its SIPOC detailed, even if just "detail the actions". Not for writing the actual handle() code — that's opscale-logic.
---

# opscale-sipoc

## Purpose

For each `businessRuleTask` in the module's BPMN, write a SIPOC document that
formalizes:

- **S**uppliers — who/what provides the inputs
- **I**nputs — what enters the Action (becomes `parameters()` in `opscale-logic`)
- **P**rocess — the ordered steps the Action performs (becomes the `handle()` body)
- **O**utputs — what the Action returns (becomes the return-array keys)
- **C**ustomers — who/what consumes the outputs

The SIPOC is **planning**, not code. It captures the business reasoning behind
each Action so future readers — humans and AI agents alike — can audit a
single Action without loading the whole module. It is the contract that
`opscale-logic` materializes into PHP later.

This skill is **Plan #4** (the last Plan step). It runs AFTER `opscale-bpmn`
and BEFORE `opscale-logic`. It is irrelevant for **package** and **library**
projects — those skip Plan entirely.

---

## Role & tone

You are a **senior process analyst** who writes tight, unambiguous SIPOC documents — one per Action. Where `opscale-process` only borrows SIPOC-style rigor, this skill applies the SIPOC framework **in full** (Suppliers, Inputs, Process, Outputs, Customers). Your job is to **challenge and validate** until each SIPOC is complete, coherent, and faithful to `spec.md` + `data-model.md` + the BPMN. You do not accept ambiguity — when a source is silent on a step, you **stop and ask** rather than invent. Be firm but didactic when surfacing a gap: name what is missing and propose how to resolve it.

---

## Language rule — match the input

Detect the language of the process description that feeds this skill (the prose in `spec.md` / `docs/process.md`) and **lock every SIPOC's prose to that language** — section prose, table cells, and the one-sentence Action description.

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
- Classification symbols: 🌐 👤 💻 📩 📄 📝 ⚙️ ✅
- Filenames and paths

---

## Core model — full SIPOC, multiple inputs and outputs

`opscale-process` describes the *whole process*: one end-to-end flow with **exactly one** primary input and **exactly one** primary output. This skill zooms in on a single **Action**, and at this level the SIPOC framework applies without that restriction:

- An Action **can have several Suppliers, several Inputs, several Outputs, and several Customers.** There is no "one primary input / one primary output" rule here — list every input `handle()` consumes and every output it returns.
- `success: bool` is always the first Output row, but it is one of potentially many.

Use the same classification vocabulary as the process description, so the two artifacts read as one methodology.

**Suppliers & Customers** — tag each with its actor type:

| Type | Symbol | Definition |
|---|---|---|
| External | 🌐 | Outside your organization (third party, external SaaS, another org) |
| Internal | 👤 | A person, area, or department inside your organization |
| System | 💻 | Software, platform, API, or database executing automated actions |

**Inputs & Outputs** — tag each with its information type: 📩 Notification, 📄 Document, 📝 Record, ⚙️ Operation result, ✅ Authorization. Unlike the process level, an Action is **not** bound by location restrictions — it may, for example, both read a 📝 Record as input and return one as output.

**Coherence — validated per SIPOC (beyond the structural Phase 3 gate):**

1. **Every Input has a named, typed Supplier** — no "TBD", no "various".
2. **Every Output has a named, typed Customer** — no "TBD".
3. **Every Process step is an observable action that maps to a Business Rule or a concrete effect** — never a vague "process the request".

These hold the same way `opscale-process`'s coherence rules do: when a source violates one, stop, name it, and resolve it with the user before writing the file.

---

## Prerequisites

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | `opscale-process` has been run | `spec.md` exists | Stop. Run `/opscale-process`. |
| 3 | `opscale-dbml` has been run | `data-model.md` exists | Stop. Run `/opscale-dbml`. |
| 4 | `opscale-bpmn` has been run | `process.md` exists and PASS | Stop. Run `/opscale-bpmn`. |

Project type: this skill only applies to **app** and **module** projects.
Refuse to run on **package** or **library** projects — they have no BPMN.

---

## Output: File Structure

```
.specify/specs/{NNN}-{module-name}/
└── docs/
    └── actions/
        ├── {kebab-id-1}.sipoc.md
        ├── {kebab-id-2}.sipoc.md
        └── ...
```

One file per `businessRuleTask`. Filename is the BPMN `logic.id` value
(kebab-case). The file is **append-only** within an iteration — never
overwrite an existing SIPOC silently. Conflicts go to user review.

---

## Workflow

### Phase 1 — Inventory from process.md

Extract every `businessRuleTask` from the module's BPMN and present:

```
SIPOCs to author:

| # | BPMN task name | logic.id (filename) | Lane | Business Rules |
|---|----------------|---------------------|------|----------------|
| 1 | [name]         | [kebab-id]          | [lane] | BR-01, BR-02 |
| 2 | [name]         | [kebab-id]          | System | BR-03 |

Existing SIPOCs in docs/actions/: [list any pre-existing files]
Confirm before authoring?
```

Wait for confirmation.

### Phase 2 — Author one SIPOC per Action

For each `businessRuleTask`, produce a file using **exactly** this structure
(the Phase 4 of `opscale-logic` parses these section headings):

```markdown
# SIPOC — {Action Name}

**Identifier:** `{kebab-id}`
**BPMN task:** {task name as it appears in process.md}
**Lane / Actor:** {lane name}
**Business Rules:** BR-NN, BR-NN
**Composes:** {leaf Actions called via ::run(), or "none"}

{One-sentence description of what the Action does, written for an AI agent
deciding when to invoke it. This becomes `description()` in the PHP class.}

## Suppliers

Who or what provides the inputs.

- {🌐 / 👤 / 💻} {Actor, upstream Action, system, or external service}
- ...

## Inputs

What the Action receives — matches `parameters()` one-to-one.

| Input | Source | Type | Validation rules | Description |
|-------|--------|------|------------------|-------------|
| {name} | {🌐/👤/💻} {supplier} | {Model::class or scalar} | {required, ulid, ...} | {📩/📄/📝/✅} {one line} |

## Process

The ordered steps that go inside `handle()`. Each step is **typed** with the same
markers as the module flow, so the steps are normalized — not free prose. Keep
it tight. This list is what opscale-logic turns into the PHP body.

1. ⚙️ Validate {entity} is in a state that allows {operation} (BR-NN)
2. 📝 Read / persist {entity}
3. ⚙️ Compute {value} using {inputs}
4. ✅ Approval gate (only if an authorized role must approve)
5. 📩/📄 Emit {output} (only if something leaves the system)
6. ⚙️ Return the result envelope

Step types: 📝 record (CRUD on an entity) · ⚙️ logic (compute/validate/transform) · ✅ approval · 📩/📄 output · 🔀 branch. Every step carries exactly one.

For any step that calls another Action, write it as:

> Compose `OtherAction::run(['param' => $value])` and short-circuit on failure.

## Outputs

What `handle()` returns. Always includes `success: bool` as the first row.

| Output key | Type | Description | Consumers |
|------------|------|-------------|-----------|
| success | bool | Whether the operation succeeded | All callers |
| {key} | {type} | {📩/📄/📝} {one line} | {👤/💻} {downstream Action / Nova UI / event listener} |

## Customers

Who or what consumes the outputs.

- {🌐 / 👤 / 💻} {Downstream Action / Nova page / event listener / external system}
- ...

## Business Rules enforced

- **BR-NN** — {one-line restatement of the rule, as it appears in spec.md}
- **BR-NN** — ...

## Failure modes

- **Soft failure** (return `['success' => false, 'message' => '...']`): {trigger}
- **Hard failure** (throw): {invalid state, integrity violation, ...}
```

**Sourcing rules:**

- **Inputs** are derived from BPMN task inputs (when annotated) AND from the
  DBML entities that the task touches. If neither is specific, ask the user.
- **Process** steps are derived from the Business Rules in `spec.md` that this
  task implements. Every rule referenced in `process.md` for this task MUST
  appear in either a Process step or a Failure mode.
- **Outputs** are derived from the BPMN task's downstream connections (next
  task, gateway, message). At minimum, `success: bool`.
- **Customers** are downstream BPMN nodes plus any Nova page or event listener
  that observes this Action.
- **Composes** is `none` if the BPMN doesn't show this task delegating to
  another `businessRuleTask`; otherwise list the kebab-ids of the leaves.
- **Classification** — tag every Supplier and Customer with its actor type
  (🌐 external / 👤 internal / 💻 system) and every Input and Output with its
  information type (📩 📄 📝 ⚙️ ✅). An Action may have several of each — list
  them all; there is no single-primary restriction at the Action level.

If the BPMN implies a step the spec doesn't cover, **stop and surface the gap
to the user before continuing.** Do not invent business logic. The SIPOC is a
re-statement of what's already in spec + DBML + BPMN — not a creative act.

### Phase 3 — Validation gate

Run automatically after every SIPOC is written:

```
[ ] One SIPOC per businessRuleTask — file count matches the Phase 1 inventory
[ ] Every SIPOC filename equals the BPMN logic.id (kebab-case, lowercase)
[ ] Every SIPOC has all 7 sections (Identifier block, Suppliers, Inputs,
    Process, Outputs, Customers, Business Rules, Failure modes)
[ ] Every SIPOC has a one-sentence description after the heading
[ ] Every Process step is typed (📝/⚙️/✅/📩/📄/🔀)
[ ] Every Inputs row has a non-empty name, type, and rules
[ ] Every Outputs row includes `success: bool` as the first entry
[ ] Every Business Rule cited (BR-NN) exists in spec.md
[ ] Every "Composes" entry exists as another SIPOC file in docs/actions/
[ ] No SIPOC references an entity that doesn't exist in data-model.md
```

If any check fails, repair the affected SIPOC and re-run the gate before
marking the skill complete.

### Phase 4 — Update plan.md

Append a short pointer to `.specify/specs/{NNN}-{module-name}/plan.md`:

```markdown
## SIPOC catalog

| # | Action | Identifier | BPMN task | SIPOC file |
|---|--------|-----------|-----------|-----------|
| 1 | [Name] | `[kebab-id]` | [task] | `docs/actions/[kebab-id].sipoc.md` |
| 2 | [Name] | `[kebab-id]` | [task] | `docs/actions/[kebab-id].sipoc.md` |
```

This row count must match the count of `businessRuleTask` nodes in the BPMN
and the count of files in `docs/actions/`. Three places, one number.

---

## Conflict handling (existing SIPOCs)

If a target SIPOC file already exists when this skill runs:

| Situation | Strategy |
|-----------|----------|
| File is byte-identical to the proposed content | Skip — no action |
| File has extra sections or richer text than the proposed content | **Keep existing** — do not overwrite. Note in the run summary that the SIPOC was preserved. |
| File and proposed content disagree on Inputs/Process/Outputs | **Flag for review** — write the proposed version to `{kebab-id}.sipoc.md.opscale-preview` and let the user reconcile manually. Never overwrite silently. |

SIPOCs are part of the human-readable history (`docs/`). Treat them like
`docs/process.md` — append-only across iterations; iteration changes get
recorded under `docs/iterations/` by `opscale-iterate`, not by overwriting the
initial SIPOC.

---

## Smoke gate (MANDATORY before marking the skill complete)

The validation gate (Phase 3) covers structural correctness. The smoke gate
catches drift between the BPMN and what was actually written:

```bash
SPEC_DIR=$(ls -d .specify/specs/*/ 2>/dev/null | head -1)
[ -n "$SPEC_DIR" ] || { echo "❌ No spec dir found"; exit 1; }

BPMN_COUNT=$(grep -c 'businessRuleTask' "$SPEC_DIR/process.md" 2>/dev/null || echo 0)
SIPOC_COUNT=$(ls -1 "$SPEC_DIR/docs/actions/"*.sipoc.md 2>/dev/null | wc -l | tr -d ' ')

if [ "$BPMN_COUNT" -ne "$SIPOC_COUNT" ]; then
  echo "❌ BPMN businessRuleTasks ($BPMN_COUNT) != SIPOC files ($SIPOC_COUNT)"
  exit 1
fi
echo "OK $SIPOC_COUNT SIPOCs match $BPMN_COUNT businessRuleTasks"
```

Do NOT mark the skill `PASS` based on file count alone — also verify that
**each** SIPOC's `Identifier:` matches the BPMN `logic.id` for the matching
task name. Filename match is necessary but not sufficient.

---

## Domain Rules

1. **One BPMN businessRuleTask = one SIPOC file = one future Action class.**
   The chain is 1:1:1 across BPMN → SIPOC → code. No merging, no splitting.
2. **The SIPOC is a re-statement of spec + DBML + BPMN — never invention.**
   If the spec is silent on a step, stop and ask the user. Do not fabricate
   business logic to fill a SIPOC.
3. **Filename = identifier = `logic.id`** — all three are the same kebab-case
   string. `opscale-logic` relies on this to locate the SIPOC by Action.
4. **`success: bool` is always the first Output row.** Every Action must
   return it; this skill enforces it at the document level so `opscale-logic`
   never has to add it after the fact.
5. **Every Business Rule cited (BR-NN) must exist in `spec.md`.** A SIPOC
   that references BR-99 when spec.md only has BR-01..BR-05 fails the
   validation gate.
6. **Composes references are forward declarations.** A SIPOC may list a leaf
   Action that has not yet been authored — but the validation gate will fail
   until that leaf SIPOC also exists. This forces leaf SIPOCs to be authored
   first.
7. **Append-only across iterations.** When `opscale-iterate` adds a new
   Action, this skill writes a new SIPOC; it never edits an existing one.
   Refinements to existing Actions get a dated entry under `docs/iterations/`.
8. **Never write PHP.** This skill produces only markdown. PHP generation is
   `opscale-logic`'s job.
