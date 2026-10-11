---
name: opscale-sipoc
description: >
  Authors one SIPOC per BPMN first-level logic operation — the bridge between
  BPMN (what) and the executable body of the generated Action (how). Step 4 of
  Plan, after opscale-bpmn; eventual consumer is opscale-logic. Trigger:
  "generate the SIPOC", "detail the actions", "describe each action". Use it
  whenever each BPMN logic operation needs its SIPOC detailed, even if just
  "detail the actions". Not for writing the Action implementation — that's
  opscale-logic.
---

# opscale-sipoc

## Context

### Purpose

For each first-level **logic operation** in the module's BPMN, author a SIPOC that formalizes:

- **S**uppliers — who/what provides the inputs
- **I**nputs — what enters the Action (becomes its declared parameters in `opscale-logic`)
- **P**rocess — the ordered steps the Action performs (becomes its executable body)
- **O**utputs — what the Action returns (become its returned output keys)
- **C**ustomers — who/what consumes the outputs

The validated source of truth is **`docs/plan/sipoc.json`**; the one-per-Action **`docs/plan/sipoc/<id>.md`** documents (the human-readable SIPOCs `opscale-logic` reads) are a deterministic projection of it — never hand-edited.

**The set of units to document is fixed upstream.** The units are exactly the first-level `type:"logic"` operations in `docs/plan/bpmn.json` — one SIPOC per logic op, 1:1, no merging, no splitting, no renaming. If a unit is missing or wrong, the fix happens by re-running `opscale-bpmn`, never here.

**Business rules are DEFINED here — the SIPOCs are the module's canonical BR-NN registry.** No earlier artifact numbers or defines business rules: the DBML models data, and `opscale-bpmn` only elicits rules as prose (the `rules` array on each logic op). This skill takes that prose, challenges and completes it with the user, assigns each rule a **module-unique `BR-NN` number** (continuous across all SIPOCs — never restarted, never duplicated), and writes the **full statement** (condition → consequence) in the owning SIPOC's `businessRules` — a single array of `{code, text}` objects. Each rule is defined in exactly one SIPOC; its `process[].rule` steps cite it by `code`. Downstream, `opscale-logic` implements the rules from these entries.

This skill is **Plan #4 of 5**. It runs AFTER `opscale-bpmn` and BEFORE the Plan closer; its eventual consumer is `opscale-logic`. It is irrelevant for **package** and **library** projects — those skip Plan entirely.

### The JSON contract

`sipoc.json` is validated against `schema/sipoc.schema.json` (which `$ref`s the shared `common.schema.json`). The schema is a hard gate. Shape:

```jsonc
{
  // NO `module` block — only process.json carries module (software/domain/subdomain).
  "sipocs": [ {                       // EXACTLY one per BPMN first-level logic op
    "id": "qualify-opportunity",      // == the BPMN logic op id (the sipoc/<id>.md filename);
                                      //    the ONLY link to bpmn — operation/subprocess/step are
                                      //    derived by matching this id to the logic op, not stored
    "title": "Calificar la oportunidad",            // H1 title, source language
    "description": "One-sentence description — becomes the Action's description.",
    "businessRules": [ { "code": "BR-01", "text": "full statement" } ],  // the module's canonical BR registry — {code,text}, defined once
    "composes": [],                   // leaf logic ids this one invokes; may be []
    "suppliers": [ { "actor": "User", "description": "..." } ],   // actor is PLAIN TEXT (no emoji)
    "inputs": [ {                     // ATOMIC — each a single scalar value
      "name": "situation", "source": "User",        // source is plain text (User / System / …)
      "type": "options",             // a sipocInputType business type — NEVER snippet/metadata/…
      "validation": "required", "description": "..." } ],
    "process": [ {                    // each step REFERENCES a composed op of the matching bpmn logic
      "operation": "SP-01-02-L01-C01",               // a composed op `code` from that logic's operations[]
      "description": "read qualification-criterion (…)", "rule": "BR-01" } ],
    "outputs": [ {                    // ATOMIC; type = businessType | 'bool' | entity code
      "name": "qualification", "consumer": "System", // consumer is plain text (mirrors input source)
      "type": "qualification", "description": "..." } ],
    "customers": [ { "actor": "System", "description": "..." } ],  // actor is plain text
    "failureModes": { "soft": ["..."], "hard": ["..."] }
  } ]
}
```

Hard schema rules: `sipocs` present (no `module` block — only `process.json` carries module); every SIPOC carries all of `id`/`title`/`description`/`businessRules`/`composes`/`suppliers`/`inputs`/`process`/`outputs`/`customers`/`failureModes`; `businessRules` is the module's canonical BR registry — a non-empty array of `{code, text}` objects (`code` matches the `ruleCode` grammar, `text` non-empty); `id` matches the `logicId` grammar; **every input `type` ∈ `sipocInputType`** — a business type, and NEVER an ambiguous one (`snippet`, `metadata`, `post`, `file`, …); every `process[].operation` matches the `composedOpCode` grammar (`SP-XX-YY-LZZ-[CLO]AA`) and every `process[].rule` the `ruleCode` grammar; `suppliers`/`customers` entries are `{actor (text), description}`; inputs are `{name, source (text), type, validation?, description}`; outputs are `{name, consumer (text), type, description}` with a **scalar** `type` (atomic — no nested/array/object types); `additionalProperties:false` throughout.

Semantic rules the schema can't express (checked by the validator against the sibling `bpmn.json` and `dbml.json`): the set of SIPOC `id`s **equals** the set of first-level `type:"logic"` op `id`s in `bpmn.json` (one per logic op — fail on any extra or missing; the link is purely by `id`); every `process[].operation` is a composed op `code` present in the matching logic op's `operations[]` array (fail on any process op the logic does not compose; warn when the logic composes an op no process step covers); `composes` entries resolve to another SIPOC id or a BPMN logic id; every `process[].rule` is one of this SIPOC's `businessRules[].code`; BR codes are **module-unique and continuous** (BR-01, BR-02, …) across all SIPOCs; every output `type` resolves to a businessType slug, the literal `bool`, or an entity `code` in `dbml.json`.

### Prerequisites

| # | Requirement | If missing |
|---|-------------|-----------|
| 1 | `opscale-process` ran (`docs/plan/process.json` present, passed) | Stop. Run `/opscale-process`. |
| 2 | `opscale-dbml` ran (`docs/plan/dbml.json` present, passed) | Stop. Run `/opscale-dbml`. |
| 3 | `opscale-bpmn` ran (`docs/plan/bpmn.json` present, passed — logic ops carry `id`, `oid`, `rules`, `composed`) | Stop. Run `/opscale-bpmn`. |

Project type: **app** and **module** only. Refuse to run on **package** or **library** projects — they have no BPMN. Step 4 of Plan: run **after** `opscale-bpmn`.

### Modes

- **Writable project folder:** write outputs directly to `docs/plan/`.
- **Chat-only session:** produce the same files as downloadable outputs, each labeled with its destination path (e.g. `docs/plan/sipoc/<id>.md`).

The agent-run validation gate (Phase 4) is mandatory in both.

### How this skill runs — context, per-item questions, generate, validate

One hard rule: **nothing is generated until every piece is confirmed, and nothing advances past a phase whose gate has not passed.** The heavy, non-interactive work is delegated to sub-agents; only the interview stays in the main conversation:

- **Phase 0 — Load context (agent).** Spawn `plan-context-loader` (skill: `sipoc`) to read `docs/plan/` — the `bpmn.json` logic ops with their `rules`/`composed`, `dbml.json` entity codes + enums, and `process.json` — and return a compact summary.
- **Phase 1 — Inventory (main conversation).** Build the one-row-per-logic-op inventory from `bpmn.json`, confirm it. The unit list is fixed upstream — never add, drop, or rename.
- **Phase 2 — Author each SIPOC (main conversation, ONE SIPOC AT A TIME).** For each logic op, walk Inputs → Suppliers → Outputs → Customers → Process/Rules. Inputs are elicited **one by one**. Each SIPOC ends in an explicit **"Wait for user approval before continuing."**
- **Phase 3 — Generate (agent).** Spawn `plan-generator` (skill: `sipoc`) with the confirmed structure; it writes `sipoc.json` and runs `render-sipoc.mjs` to project every `sipoc/<id>.md`.
- **Phase 4 — Validate (agent).** Spawn `plan-validator` (skill: `sipoc`); it runs `validate-sipoc.mjs`. A failed gate is fixed and re-run, never silently patched.

### Language rule — structural keys English, content in the user's language

Detect the language of the flow feeding this skill (the step lines in `process.json` and the canonical names) and **lock every SIPOC's prose to that language** — `title`, `purpose`, table-cell text, descriptions, BR statements, failure modes.

**What stays language-neutral (never translate):** the kebab `id` (= filename), the `process[].operation` composed-op codes, and `BR-NN` codes; business-type slugs and entity codes in the `type` columns; the output name `success`; filenames and paths. Actor labels (`suppliers`/`customers` `actor`, input `source`, output `consumer`) are plain text — write them in the source language (`User`/`System`, or `All callers` for `success`); they carry no fixed spelling. The section headings in the rendered markdown (`Suppliers`, `Inputs`, `Process`, `Outputs`, `Customers`, `Business Rules`, `Failure modes`) are fixed strings the renderer emits — `opscale-logic` parses them literally.

### Core model — full SIPOC, atomic inputs and outputs

`opscale-process` describes the *whole process* (one primary input, one primary output). This skill zooms into a single **Action**, where the SIPOC framework applies in full:

- An Action **can have several Suppliers, Inputs, Outputs, and Customers.** List every input it consumes and every output it returns.
- **Inputs and outputs are ATOMIC** — each row is a single scalar value with a single scalar `type`. Never a nested object, an array, or a composite. If a form submits a bundle, decompose it into one input row per field.
- `success: bool` is always the first Output row (`consumer: "All callers"`), but it is one of potentially many.

**Suppliers & Customers** carry NO identity — only the actor type, written as **plain text**, exactly one of two (there is no third category):

| Type | Text | Definition |
|---|---|---|
| User | `User` | A person — staff, customer, partner, third-party operator. Anyone interacting through a UI, API request, email reply, or any human channel. |
| System | `System` | Software — internal service, external SaaS, scheduled job, queue, database, API. Anything producing or consuming data with no human in the loop at that step. |

Do not name the person, role, or system — a Supplier is `User` or `System`, nothing more (write the label in the source language; there is no emoji). The same applies to the Inputs `source` and the Outputs `consumer` (where `All callers` is also allowed, for `success`).

### Typing rule — inputs are business types; outputs add entities and `bool`

- **Every input `type` is a `sipocInputType`** — a business-type slug the user hands over (`identifier`, `options`, `name`, `description`, `date`, `money`, `email`, …). The ambiguous types (`snippet`, `metadata`, `post`, `file`, `image`, …) are **excluded by the schema** — an input is always a concrete business value. A business type carries its validation semantics implicitly (typing an input `email` means valid-email-format); the `validation` field only adds constraints the type doesn't already imply (`required`, cross-field conditions).
- **Every output `type`** resolves to a business-type slug, the literal `bool` (only `success`), or an **entity `code`** from `docs/plan/dbml.json` (when the value is a whole record). Entities are referenced by their **kebab `code`** (`qualification-criterion`, not `qualification_criterion`), consistent across all Plan artifacts.

No `object`/`array`/`string`/`int`/`json`/`mixed` ever — if nothing fits an input, extend the business-type registry first.

**Coherence (validated per SIPOC):** every Input has a typed Supplier; every Output has a typed Customer; every Process step **references a composed operation** (by `code`) of the matching BPMN logic op — an observable CRUD/logic/output operation that maps to a Business Rule or a concrete effect, never a vague "process the request". When a source violates one of these, stop, name what's missing, and resolve it with the user before authoring.

### Domain Rules

1. **One BPMN logic op = one SIPOC = one future Action class.** 1:1:1 across BPMN → SIPOC → code. The unit list is fixed by `opscale-bpmn`; a wrong list is repaired there, never here.
2. **The SIPOC re-states spec + DBML + BPMN — never invents.** If a source is silent on a step, stop and ask. Do not fabricate business logic.
3. **`id` = filename = BPMN logic id** — kebab-case, lowercase; it is the SIPOC's ONLY link to BPMN (operation/subprocess/step are derived by matching it to the logic op, never stored). `opscale-logic` locates the SIPOC by Action through this id.
4. **`success: bool` is always the first Output.** Every Action returns it.
5. **Every cited `BR-NN` is defined in exactly one SIPOC's `businessRules`** (the `{code, text}` registry). Numbering is module-unique and continuous; a `process[].rule` citing a code absent from that SIPOC's `businessRules`, or the same number defined twice, fails the gate.
6. **`composes` entries are forward declarations.** Each resolves to another SIPOC id or a BPMN logic id — composition reuses units, it never creates them.
7. **The JSON is the source of truth.** The markdown is a projection — regenerated wholesale on every run, never hand-edited. (There is no append-only markdown concern: the authored `sipoc.json` is the only thing edited.)
8. **Never write implementation code.** This skill produces only `sipoc.json` and its rendered markdown. Code generation is `opscale-logic`'s job.

### Output

```
docs/plan/
├── sipoc.json              ← validated source of truth (authored here)
└── sipoc/
    ├── qualify-opportunity.md   ← deterministic projection (one per logic op; opscale-logic reads these)
    └── ...
```

## Steps

### Phase 0 — Load context (agent)

Spawn `plan-context-loader` (skill: `sipoc`). It returns a compact summary of `docs/plan/`: the first-level `type:"logic"` ops in `bpmn.json` (each with `id`, `oid`, `subprocess`/`step`, `rules`, `composed`), the entity `code`s and enums in `dbml.json`, and the flow language from `process.json`. Keeps large files out of the main context.

### Phase 1 — Inventory the logic units (authorization gate)

The units to detail are **not elicited here** — they are the first-level `type:"logic"` ops in `docs/plan/bpmn.json`. Build one row per logic op. Present:

```
SIPOCs to author (source: the first-level type:"logic" operations in docs/plan/bpmn.json):

| # | Action (logic op) | id (filename) | Operation (oid) | Subprocess | Rules (prose, from BPMN) |
|---|-------------------|---------------|-----------------|------------|--------------------------|
| 1 | Calificar la oportunidad | qualify-opportunity | SP-01-02-L01 | Registro y calificación | BR candidate: puntaje SPICED… |

Confirm before authoring? (The unit list is fixed in /opscale-bpmn — I will not add, drop, or rename any.)
```

**Wait for user approval before continuing.**

### Phase 2 — Author each SIPOC (ONE SIPOC AT A TIME — hard stop-gate)

Walk the logic ops **in order, one at a time**. For each, walk these five sub-phases; each ends in a confirmation gate. The order is intentional: establish *what enters and who provides it*, then *what leaves and who consumes it*, and only then pull the **Process** from the logic op's `composed` array. Process is **imported, not re-elaborated** — that prevents BPMN ↔ SIPOC drift.

**Why one at a time:** presenting many SIPOCs at once collapses attention — the user confirms by reflex. Each SIPOC materializes one-for-one into an Action. **Stop-gate: do not advance to the next logic op until the current SIPOC is confirmed.** If the user says "they all look fine, move on," push back and present them one at a time anyway.

**2.1 — Inputs (ONE INPUT AT A TIME).** Elicit the inputs the Action consumes **one by one** — for each: `name`, `source` (plain text — `User`/`System`), `type` (a `sipocInputType` business slug), and any `validation` beyond what the type implies. Inputs are **atomic**: one scalar value per row — decompose any bundle. No "TBD", no "various"; if the spec/BPMN is silent, stop and ask. Confirm the input list.

**2.2 — Suppliers (derived from inputs).** Every input traces to a Supplier labelled `User` or `System` (plain text) — no third category. Confirm the supplier list.

**2.3 — Outputs.** `success: bool` is mandatory and always first. For each additional output: `name`, `type` (business slug, `bool`, or a `dbml.json` entity code), `description`, `consumer` (plain text — `User`/`System`/`All callers`). Outputs are **atomic**. Confirm the output list.

**2.4 — Customers (derived from outputs).** Every output traces to a Customer labelled `User` or `System` (`success` → `All callers`). Confirm the customer list.

**2.5 — Process (references the logic op's composed operations) + Rules.** The Process is that op's `operations` list in order: each step **references a composed operation by its `code`** (`SP-XX-YY-LZZ-[CLO]AA`, a read/update/delete CRUD, a composed `L` logic reference, or an `O` output) with a short `description` and the governing `BR-NN` in `rule`. Process is **imported, not invented** — every `process[].operation` must be a `code` the matching logic op composes; a `create` is never composed (creation is a standalone step-level CRUD outside the logic). The renderer appends the final `return result`. Challenge and complete each rule's prose, assign its module-unique `BR-NN`, and write the full statement as a `{code, text}` entry in `businessRules`. Capture `failureModes` (soft/hard). If a composed operation references an entity not in `dbml.json`, or cites a rule with no counterpart in the op's `rules` array, **stop and surface the gap** — do not invent.

**Wait for user approval before continuing (per SIPOC).**

### Phase 3 — Generate (agent)

Spawn `plan-generator` (skill: `sipoc`) with the confirmed structure. It writes `docs/plan/sipoc.json` and runs `render-sipoc.mjs --dir=docs/plan` to project every `docs/plan/sipoc/<id>.md`. Replace existing files. Never hand-edit the markdown.

### Phase 4 — Validate (agent)

Spawn `plan-validator` (skill: `sipoc`). It runs `validate-sipoc.mjs --dir=docs/plan`: schema + semantic rules (1:1 with the BPMN logic ops by `id`, every `process[].operation` a composed op of the matching logic, `composes` resolution, BR citation + module-unique continuity, output-type resolution against `dbml.json`), then re-renders every SIPOC in memory and confirms each on-disk `sipoc/<id>.md` matches the projection (no manual drift). If it fails, fix the JSON and regenerate — never patch the markdown. The skill does not close until it passes.

## Success condition

```bash
node scripts/validate-sipoc.mjs --dir=docs/plan
```

Exit code 0 = pass (1 = fail, 2 = review warnings).
