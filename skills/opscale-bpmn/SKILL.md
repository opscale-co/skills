---
name: opscale-bpmn
description: >
  Generates a BPMN 2.0 XML process file from the spec and DBML. Step 3 of
  Plan — runs after opscale-dbml, before opscale-sipoc. Trigger: "generate the
  BPMN", "map the process", "define the flow", "create the process diagram".
  Use it whenever the process flow needs to be defined as BPMN, even if phrased loosely. Don't use it to model data (opscale-dbml) or detail action internals (opscale-sipoc).
---

# opscale-bpmn

## Context

### Purpose

Transform a validated spec and DBML into a BPMN 2.0 XML file that maps the business process to executable Opscale operations. The BPMN is the authoritative source for what gets implemented — every task maps directly to a class.

Outputs are exactly two: `docs/plan/bpmn.bpmn` (raw BPMN 2.0 XML — the diagram, **self-contained**: every task's `<documentation>` JSON carries its business step, subprocess, and — for Logics — governing rules and composed CRUDs/Outputs; this embedded metadata is what `opscale-sipoc` imports) and `docs/plan/bpmn.txt` (this skill's relative ontology: per subprocess, each business step and the operations it decomposes into, with each Logic's composed CRUDs and Outputs indented beneath it). Note: an Output is never a standalone node — it is always composed inside the Logic that dispatches it. Canonical paths: `references/artifact-paths.md`.

### Modes

The mode depends on whether a writable project folder is available — not on which app is running. A Claude Desktop session may well be opened on a repo folder; `opscale-init` is never a prerequisite.

- **Writable project folder (Claude Code, or Claude Desktop on a repo/folder):** write the two outputs directly to `docs/plan/`.
- **No folder access (chat-only session):** produce exactly the same files as downloadable outputs, each labeled with its destination path (`docs/plan/bpmn.bpmn`, `docs/plan/bpmn.txt`); the user drops them into the repo afterwards.
- **The validation gate is mandatory in both environments.** The skill ships its own `node_modules`, so `node scripts/validate-bpmn.mjs docs/plan/bpmn.bpmn` runs offline — no `npm install`, anywhere, ever.

**Propose → approve → write → validate.** Nothing is assumed: every phase and sub-phase ends in an explicit user approval, and no artifact is written before the user approved its content in conversation. Validators run after writing; a failed gate is fixed and re-run, never silently patched.

### Prerequisites — MUST be satisfied (ordered)

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-process` has been run for this module | `docs/plan/process.txt` and `docs/plan/context/names.md` exist and PASS | Stop. Run `/opscale-process` first. |
| 2 | `opscale-dbml` has been run for this module | `docs/plan/dbml.dbml` exists and PASS | Stop. Run `/opscale-dbml` first. |

This skill is **Step 3 of the Plan phase**. The Plan phase is `process → dbml → bpmn → sipoc → ontology` — strictly ordered, no skipping. After `opscale-ontology` closes the phase, the module enters the Generate phase (`domain → ui → logic`).

### Allowed BPMN elements

| Category | Elements |
|----------|----------|
| Tasks | `serviceTask` (crud), `businessRuleTask` (logic) |
| Gateways | `exclusiveGateway`, `parallelGateway`, `inclusiveGateway`, `eventBasedGateway` |
| Events | `startEvent`, `endEvent`, `intermediateCatchEvent`, `intermediateThrowEvent` |
| Flows | `sequenceFlow`, `messageFlow` |

Note: there is **no `sendTask`** — Outputs are not nodes; they are composed members of a Logic's `businessRuleTask`.

### Opscale Task Types

Only two node task types exist (`serviceTask`, `businessRuleTask`); everything else is forbidden. Outputs are the third *category* but live as composed metadata inside a Logic, not as their own node.

#### serviceTask — `crud`

Persistence and query operations on domain entities. No business logic, no conditions, no transformations. Actions are `create | read | update | delete`. **Simple queries always use `serviceTask` with `action: "read"` — never `businessRuleTask`.**

#### businessRuleTask — `logic`

Encapsulated business operation — anything **heavier than a single CRUD**. A step is `logic` when it does one or more of: queries an **external source** to proceed, requires an **approval** by an authorized role, **gathers additional data** before it can continue, **calculates / transforms** with formulas, or **coordinates multiple entities**. Maps to exactly one Opscale Action class. Its `composed` array carries the CRUDs it orchestrates, **the Outputs it dispatches**, and — when it invokes another Action — a **Logic reference** to that Action (which must exist as its own `businessRuleTask` node; composition never defines a new unit).

**Naming — MANDATORY: `verb + noun` in natural language.** Sentence case, spaces between words, no PascalCase, no class-name form, no abbreviations. Examples: `"Calculate interest"`, `"Approve loan"`. The `id` inside `<documentation>` is the kebab-case slug derived from that phrase — downstream skills derive the Action class name from it.

#### output — composed member (no node)

Something that leaves the system (a notification, a document, a webhook). Maps to exactly one Output class at Generate time, dispatched by the Action of its owning Logic. **An Output is never a node** — it is an entry in some Logic's `composed` array. The Plan records only WHAT leaves (the `"content"` phrase); the concrete channel (email, push, PDF, SMS, webhook, …) is decided in the Generate phase.

| Use businessRuleTask for | Use serviceTask (crud) for | Compose an output inside a Logic for |
|-------------------------|---------------------------|------------------|
| Calculate totals, apply discounts | Get customer data | The notification a decision sends |
| Validate business rules | Query product list | The document an approval delivers |
| Generate sequential numbers | Read configuration | The webhook a state change fires |
| Apply complex transformations | Search records, simple lookups | |

For the verbatim XML snippet for each task type (with `<documentation>` payload shape), see `references/bpmn-templates.md`.

#### Forbidden task types

`userTask` · `manualTask` · `receiveTask` · `scriptTask` · `callActivity`

### General rule — the five operation categories

Operations are the atomic, technical level — what a business step decomposes into. Every operation is exactly one of the five categories below. **Only CRUD and Logic can be *standalone* (step-level) operations**; **Output is never standalone — it is always composed inside a Logic** (see below); Event and Gateway are **flow elements** that structure the sequence:

| Category | BPMN element | What it is |
|---|---|---|
| **CRUD** | `serviceTask` (type=crud) | A single create / read / update / delete on one entity. No business rules, no orchestration. Standalone only when no Logic absorbs it |
| **Logic** | `businessRuleTask` (type=logic) | **An orchestrated bundle of CRUDs (and its Outputs) driven by a business rule** — sometimes plus an external lookup, an approval, or a calculation. The bundle is what makes it a Logic; a Logic with zero CRUDs is suspicious — re-examine it |
| **Output** | composed member of a Logic (type=output) | Something that leaves the system (a notification, a document, a webhook). **Always part of a Logic** — never a standalone node. It is the effect the Logic dispatches once its rule resolves |
| **Event** | `intermediateCatchEvent` | A wait for something external to arrive |
| **Gateway** | `exclusiveGateway` (or `parallel`/`inclusive`) | A branch on a condition |

Nothing else is a step. If you cannot place a candidate step into one of these five, you have either (a) discovered a sub-step that belongs inside a Logic, or (b) something that does not belong in the BPMN at all (UI affordance, infra detail). Ask before forcing it in.

**Outputs are never loose — they belong to the Logic that produces them.** A notification/document/webhook is the *consequence* of a business rule resolving: you notify **because** something was decided, changed, or approved. So every Output is composed inside the Logic that dispatches it — it appears in that Logic's composition (alongside its CRUDs), never as a step-level sibling and never as its own `sendTask` node. When a business step reads as "just a notification" with no data change of its own, its Output attaches to the Logic whose outcome it communicates (usually in the same or the immediately preceding step). If there is genuinely no such Logic, that is a modeling gap — the state change the notification reports was probably left as a loose CRUD that should be a Logic; surface it and ask, do not emit a standalone output.

**Logic = orchestrated CRUDs.** The classic shape is a constrained state transition: a record cannot move from status A to status B freely — moving it also requires reading X, validating Y, and creating Z. Examples:

- *Submit article for review* (`submit-for-review`): `update articles.status → reviewing` + `create review_checklist`.
- *Publish article* (`publish-article`): `read review_checklist` (verify all complete) + `update articles.status → published`.
- *Approve loan* (`approve-loan`): `read credit_score` (external) + `update loan.status → approved` + `create approval_record`.

The CRUDs — **and the Outputs** — that compose a Logic are not separate nodes in the BPMN: they live inside the Logic's `businessRuleTask` (its `composed` array). Only CRUDs that do **not** belong to any Logic become standalone `serviceTask` nodes; Outputs are **always** composed, so there are **no `sendTask` nodes** at all.

**Approvals are two-outcome.** Every approval business step (a formal go/no-go by an authorized role — spot them by meaning, e.g. "approve", "authorize", "sign off") implies both resolutions: the approving Logic and its rejecting counterpart (`approve-x` / `reject-x`), each with its own guarded transition and its own SIPOC, separated by the gateway that carries the decision. The same applies to any acceptance the flow waits on (an offer can be declined). Modeling only the happy path is a gap the 2.1 rules elicitation must catch — a lifecycle with an approval stage always has a rejected/declined branch somewhere.

**Lifecycle transitions are always Logic.** If an entity has a lifecycle (spec *Lifecycle* section), its status is a pipeline: a stage can only be entered from the allowed previous stage, so moving it always requires at least reading the current status and validating the transition — which is by definition more than a single CRUD. A standalone `crud: update {entity}.status` in the grouped sequence is a red flag: either it belongs inside a Logic, or the transition guard is missing from the rules elicited in 2.1. The same applies to operations gated by a status (e.g. an interview cannot be created for a candidate that has not been screened — creating it is a Logic that verifies the pipeline stage first). Creating a record with its *initial* status is not a transition — plain CRUD is fine there.

### Mapping the module spec to BPMN — business steps decompose into operations

`opscale-process` produced **business steps** — broad, untyped activities in the stakeholder's language, grouped into subprocesses whose `*Trigger:*` / `*Ends with:*` lines carry the separating events. This skill decomposes each business step into its **atomic operations**: one business step can yield one operation or ten. Classify each operation from the step's *meaning* — the spec carries no type markers:

| What the business step does (read its meaning) | Typically decomposes into |
|---|---|
| records something (create/update — names an entity) | one or more `serviceTask` (`type=crud`) |
| runs business logic (calculate, validate, compare) | `businessRuleTask` (`type=logic`) + the CRUDs it orchestrates |
| formal approval by an authorized role | `businessRuleTask` (`type=logic`) |
| sends a message / delivers a file | an **Output composed inside the Logic that produces it** (`type=output`, in that Logic's `composed` array) — never a standalone node |
| the subprocess's `*Ends with:*` wait | `intermediateCatchEvent` (structural — stays 1:1) |
| branches on a question (`… → N` destinations) | `exclusiveGateway` (structural — stays 1:1) |

The business step → operations trace is recorded **inside the XML**: every task's `<documentation>` JSON carries `"step"` and `"subprocess"`, and `docs/plan/bpmn.txt` presents the same trace as a plain outline — so business readers can find their business step and see exactly what it became. The BPMN itself stays at operation level — business steps do not appear as BPMN elements, only as metadata.

**The BPMN is flat — no `subProcess` elements.** `docs/plan/process.txt` lists the subprocesses inside the module's macro-flow, but they do NOT become containers in the XML: the whole module is one flat sequence of tasks, gateways and events. Each subprocess boundary is the `intermediateCatchEvent` (the spec's `*Ends with:*` wait) that closes it — the waits are the joints between phases. The subprocess grouping lives in each task's `<documentation>` JSON (`"subprocess"` key) and, readable at a glance, in `docs/plan/bpmn.txt`. Model the **whole module**, not a single process.

### Domain rules (general rule — every task references a DBML entity)

The workflow is strictly sequential: **flows → steps per flow → BPMN**. Do not attempt to classify a single step before the user has approved (a) the list of flows and (b) the step list for the flow that step belongs to. Never generate the BPMN until every flow has been walked.

Every CRUD's entity MUST exist in `docs/plan/dbml.dbml`. If it doesn't, stop and have the user fix the DBML first. Every Logic must be named **`verb + noun` in natural language** (sentence case). Every gateway branch carries a target step number on the same line.

### Output, layout, ID conventions

`docs/plan/bpmn.bpmn` is raw BPMN 2.0 XML — no markdown wrapper, no surrounding prose. Loadable directly in Camunda Modeler or bpmn.io. No summary table prefaces the XML — the Phase 3 consolidated summary is presented in conversation only.

For the full `<bpmn:definitions>` skeleton (process + tasks + gateway + end events + sequence flows + BPMNDiagram with shapes and edges), the layout-rules table (element widths/heights, spacing, flow direction), and the ID-prefix convention table, see `references/bpmn-templates.md`.

## Steps

### Phase 1 — Subprocess inventory (reconcile as-is flows against the systematized model)

`opscale-process` captured the subprocesses as the area runs **today** — including manual handoffs, workarounds, and informal boundaries that may exist only because no system supports the step. The BPMN must reflect the **to-be systematized** version, aligned with the modeling standard chosen in `opscale-dbml` Phase 1. Translating each as-is subprocess one-to-one into a segment of the flow is the wrong default; first contrast them against the standard and decide what to add, drop, merge, split or rename.

**1a. Read inputs:**

- `docs/plan/process.txt` → the subprocess blocks. Each subprocess block there is a **candidate** flow (as-is) — not a locked one.
- `docs/plan/dbml.dbml` → (i) all table names (the only valid `entity` values for `serviceTask` crud) and (ii) the **modeling standard** recorded by `opscale-dbml` Phase 1 in the Project block's `Note:`. If the standard is not findable there, ask the user which one applies (or "none").

**1b. Contrast the as-is candidates against the standard:**

For each as-is subprocess, classify it against the standard:

| Case | Action |
|---|---|
| Matches a process the standard defines | Keep; rename to the standard's term if different |
| Several as-is subprocesses collapse into one standard process | **Ask** whether to merge |
| One as-is subprocess splits into two standard processes | **Ask** whether to split |
| As-is subprocess is manual scaffolding that disappears once systematized (paper handoff, ad-hoc reconciliation, email loop replaced by a notification + event) | **Ask** whether to drop |
| Standard requires a process not in the as-is flow (periodic reconciliation, audit emission, KYC refresh, scheduled job, etc.) | **Ask** whether to add |
| As-is subprocess has no counterpart in the standard | **Ask**: keep as module-specific extension, fold into a standard process, or drop |
| No standard was chosen ("none") | Default to the as-is list, but still **ask** whether any subprocess looks like manual scaffolding that should drop once systematized |

**1c. Present the reconciled proposal and wait for approval:**

```
Modeling standard (from opscale-dbml Phase 1): [name or "none"]

As-is subprocesses in docs/plan/process.txt:
- [As-is A]
- [As-is B]
- ...

Reconciled subprocess list (what the BPMN will model — to-be):
1. [Subprocess 1] — [kept | renamed from <X> | merged from <X>+<Y> | split from <X> | added per standard | kept as extension] — [one-line purpose]
2. [Subprocess 2] — ...

Dropped (as-is artifacts not modeled in the to-be):
- [As-is X] — [reason: manual scaffolding / replaced by event / outside standard scope]

DBML entities available: [comma-separated table list]

Confirm the subprocess list? Any to add, drop, merge, split, or rename?
```

If the user accepts changes that drift from the spec (added / dropped / merged / split / renamed subprocesses), update `docs/plan/process.txt` **and regenerate `docs/plan/process.mmd` to match** before continuing — the two are views of one confirmed flow and must never disagree. Then re-run the `opscale-process` gate (its bundled `validate-process` validator, invoked with the `process.txt`, names file, and `.mmd`) so the spec gate stays green. The same applies anywhere this skill amends the spec (e.g. Phase 2.2).

**Wait for user approval before continuing.**

### Phase 2 — Walk each approved subprocess: rules → atomic sequence → grouped sequence → recap

For **each approved subprocess, in order**, walk these four sub-phases. Each one ends in a confirmation gate. The progressive structure is intentional: 2.1 establishes *why* (the rules), 2.2 surfaces *what happens* at the lowest level (atomic, no Logic yet), 2.3 collapses CRUD chains into named Logics for readability, and 2.4 expands the full detail one last time before the BPMN is generated.

**2.1 — Elicit business rules**

Before listing any step, ask what business rules govern this subprocess. **Always ask** — the rules are what reveal where Logics live.

```
Subprocess "[Subprocess name]" — what business rules govern this flow?

Examples of what counts as a business rule:
- Status transitions that aren't free (X can only move to Y if …)
- External lookups that must succeed before proceeding (credit score, KYC, inventory)
- Approvals required from an authorized role
- Calculations or validations combining several entities
- Sequencing requirements (A must happen before B; B cannot repeat after C)
- Side effects that must accompany another action (status N also creates …)

List the rules that apply here.
```

Wait for the rules. They become the contract for 2.2 and 2.3.

**2.2 — Atomic operation sequence (CRUD + Output + Event + Gateway — no Logic yet)**

Walk the subprocess **step by step** (the numbered business steps of its block in `docs/plan/process.txt`) and decompose each business step into its atomic operations: every CRUD shown individually, every output, event, and gateway in place. One business step can yield several operations — keep them grouped under their business step so the business trace survives. **No Logic yet** — that grouping happens in 2.3. Listed only, no detail, so the sequence stays readable.

```
Subprocess "[Subprocess name]" — atomic sequence:

Step 1) "Send to review":
1. CRUD         update articles.status → reviewing
2. CRUD         create review_checklist

Step 2) "Wait for editor review":
3. Event        wait for editor to complete checklist

Step 3) "Publish article":
4. CRUD         read review_checklist
5. Gateway      checklist complete?  yes → 6  |  no → 3
6. CRUD         update articles.status → published
7. Output       email author "your article is live"

Confirm the atomic sequence (and that each business step's decomposition is faithful)?
```

Rules during 2.2:
- Every operation belongs to exactly one business step. If an operation doesn't trace to any business step in `docs/plan/process.txt`, either a business step is missing from the spec (go back and add it with the user, updating `docs/plan/process.txt` and `process.mmd` per the Phase 1c rule) or the operation doesn't belong in the module.
- **A business step should decompose into several operations** (`opscale-process` writes steps as macro activities). If a step resolves to a single operation — outside the central entity's initial create — that's a sign it arrived too granular from `opscale-process`: surface it and offer to merge it into a neighbouring activity in `docs/plan/process.txt`. This is guidance, not a gate — don't block on it, just flag it.
- Every line is exactly one of CRUD / Output / Event / Gateway. If a candidate doesn't fit, **stop and ask** — it either belongs inside a Logic (handled in 2.3) or does not belong in the BPMN.
- Every CRUD's entity MUST exist in `docs/plan/dbml.dbml`. If it doesn't, stop and have the user fix the DBML first.
- Every gateway branch carries a target step number on the same line (`yes → N  |  no → M`).

Wait for confirmation before 2.3.

**2.3 — Group CRUDs into Logics (verb + noun), present grouped sequence**

Suggest which contiguous CRUDs (optionally with an external lookup, approval, or calculation) collapse into a single Logic. Each Logic is named **`verb + noun` in natural language** (sentence case, e.g. `"Submit for review"`); its `id` is the kebab-case slug (`submit-for-review`). Re-list the flow with Logics replacing their absorbed CRUDs. Listed only — composition detail comes in 2.4.

```
Subprocess "[Subprocess name]" — grouped sequence:

1. Logic         "Submit for review"   (id: submit-for-review)
2. Event         wait for editor to complete checklist
3. Gateway       checklist complete?  yes → 4  |  no → 2
4. Logic         "Publish article"     (id: publish-article)
                   ↳ output: publication notice to the author   ← composed inside publish-article

Confirm the grouping?
```

(The output is shown under the Logic that dispatches it — it is part of that Logic, never a standalone line.)

Rules during 2.3:
- Every Logic must absorb at least one CRUD from the 2.2 atomic sequence. A zero-CRUD Logic is suspicious — re-examine before continuing.
- Every `update {entity}.status` on a lifecycle entity must end up inside a Logic (see *Lifecycle transitions are always Logic*). If one survives as a standalone CRUD after grouping, go back: a transition rule is missing.
- A Logic normally lives inside one business step. If a business rule forces grouping CRUDs across two business steps, surface it — the business steps may be one activity artificially split, or the rule may be mis-scoped. Ask before grouping across the boundary.
- Logics must respect the order from 2.2 — grouping collapses contiguous steps, it does not reorder them. Reordering needs to go back to 2.2.
- A CRUD that no Logic absorbs survives as a standalone CRUD line in the grouped sequence.
- **Every Output is absorbed into a Logic** — the one that dispatches it (its cause). An Output never survives as a standalone line. If an Output has no Logic to attach to, surface the gap (its underlying state change is probably a loose CRUD that should be a Logic).
- Events and Gateways are never absorbed into a Logic — they always remain their own line.

Wait for confirmation before 2.4.

**2.4 — Detailed recap**

Expand the grouped sequence into the full detail the BPMN needs. This is the final per-subprocess artifact — once confirmed, the subprocess is locked.

```
Subprocess [n] "[Subprocess name]" — locked:

Logics (each → one businessRuleTask):
- "Submit for review" (id: submit-for-review)
    business step: "[business step from process.txt]"
    governed by: [rule(s) from 2.1]
    composed of:
      - update articles.status → reviewing
      - create review_checklist
- "Publish article" (id: publish-article)
    governed by: [rule(s) from 2.1]
    composed of:
      - read review_checklist (verify all complete)
      - update articles.status → published
      - output: publication notice to the author

Standalone CRUDs (each → one serviceTask):
- (none)   ← or: [crud action] on [entity]

Outputs: (none standalone — every output is composed inside a Logic above)

Events (each → one intermediateCatchEvent):
- wait for editor to complete checklist — resumes step 3

Gateways (each → one exclusiveGateway):
- "Checklist complete?" — yes → step 4 (Publish article)  |  no → step 2 (wait again)

Move to next subprocess?
```

Wait for confirmation. Then repeat 2.1–2.4 for the next approved subprocess. **Do not skip ahead to the BPMN while any subprocess is still unwalked.**

**Wait for user approval before continuing.**

### Phase 3 — Connect flows (final summary before generating)

After every flow has been locked, present the consolidated summary:

```
Summary before generating BPMN:

Flows (flat segments, each closed by its *Ends with:* wait):
- [Flow 1] → [n steps]
- [Flow 2] → [n steps]

CRUD (serviceTask):
- [entity] → [action]   (in flow: [flow name])

Logic (businessRuleTask) — verb + noun, natural language:
- "[Verb noun]" (id: `[verb-noun]`)   (in flow: [flow name])

Output (composed inside a Logic):
- `[brief content]` — part of `[logic-id]`   (in flow: [flow name])

Flow (top level):
- Start: [trigger from spec]
- Gateways: [list]
- End: [post-conditions from spec]

DBML entities used: [list]

Generate BPMN file?
```

Never generate without explicit confirmation.

**Wait for user approval before continuing.**

### Phase 4 — Validate XML (assemble, write, validate)

Assemble the complete BPMN 2.0 XML and write it to `docs/plan/bpmn.bpmn` (create `docs/plan/` if it doesn't exist). Then run the bundled validator against it — from the skill bundle directory, so the bundled `node_modules` resolve; no install, no temp files outside the workspace (`bpmn.txt` doesn't exist yet at this point — the flags are added on the final success-condition run):

```bash
node scripts/validate-bpmn.mjs docs/plan/bpmn.bpmn
```

Exit `1` = XML/BPMN structure error, exit `2` = quality warnings (forbidden task types, missing docs, unlabelled gateway branches, orphan tasks, missing start/end events), exit `0` = proceed. On `1` or `2`, fix the XML in place and re-run until it exits `0`. The gate is mandatory in both Claude Code and Claude Desktop (see *Modes*).

For the verbatim run commands, see `references/validator.md`.

Only after the validator exits with `0`, complete the artifact set — exactly two files:

1. **`docs/plan/bpmn.bpmn`** — the validated raw BPMN 2.0 XML (no markdown wrapper), **self-contained**: everything Phase 2 confirmed travels inside the XML as `<documentation>` JSON (see *Embedded metadata* below and `references/bpmn-templates.md` for the verbatim shapes). This is the canonical artifact downstream skills (sipoc, ontology, logic, test) and BPMN tooling (Camunda Modeler, bpmn.io) consume directly — no companion file is needed to interpret it.

   **Embedded metadata (the source of truth):**
   - `<bpmn:process>`-level `<bpmn:documentation>`: `{"module":"{module-name}","standard":"{modeling standard from dbml Phase 1, or none}"}`.
   - **Every operation carries its ontology id (`oid`)**: standalone operations are `SP-XX-YY-[C|L]ZZ` — subprocess XX and local step YY from `process.txt`, category letter (C crud, L logic — never O: an Output is never standalone, so O never appears at step level), ZZ counting per category within the step. Composed members inside a Logic use the nested form `SP-XX-YY-LZZ-[C|L|O]AA`. Oids are unique across the module.
   - Every standalone `serviceTask` `<bpmn:documentation>`: `{"type":"crud","oid":"SP-XX-YY-CZZ","entity":"…","action":"…","step":"{business step from process.txt}","subprocess":"{subprocess name}"}`.
   - Every `businessRuleTask` `<bpmn:documentation>`: `{"type":"logic","oid":"SP-XX-YY-LZZ","id":"{kebab-id}","step":"…","subprocess":"…","rules":["{2.1 rule in prose — BR-NN numbering is assigned later by opscale-sipoc}"],"composed":[…]}`. **Key order is fixed** — `type`, `oid`, then `id` — so downstream regex parsers stay valid.
   - The `composed` array mixes CRUD, Logic-reference, and Output members: a CRUD is `{"oid":"SP-XX-YY-LZZ-CAA","entity":"…","action":"…"}`; a **Logic reference is `{"oid":"SP-XX-YY-LZZ-LAA","id":"{leaf-kebab-id}"}`** — a reuse of an Action that exists elsewhere in the module as its own `businessRuleTask` node (the leaf keeps its own SIPOC; it is referenced, never re-expanded); an **Output is `{"oid":"SP-XX-YY-LZZ-OAA","content":"{brief WHAT leaves the system}"}`** (no channel — that is a Generate-phase decision). There are **no `sendTask` nodes**: every Output lives here, inside its Logic.
   - A Logic id reused by several nodes (e.g. a shared discard) carries **identical JSON in every node** (same oid included).
   - The prose in `"rules"` and Output `"content"` must not contain raw `<` or `&` (they break XML parsing) — rephrase or escape.

2. **`docs/plan/bpmn.txt`** — this skill's relative ontology, one section per subprocess (same count, order, ids, and names as the `docs/plan/process.txt` blocks). Sections are separated by **one blank line; there are no blank lines inside a section** (the blank line is the subprocess boundary, exactly like `process.txt` blocks). Each section: the `SP-XX {name}` line, then each of its business steps followed by its operations. **Operation lines are concise — the detail lives in the SIPOC, never here**:

   Only two kinds of **top-level** operation line exist — standalone crud and logic:
   - `- {oid} crud: {action} {entity}` — the CRUD action and the entity, nothing else (no parentheses, no column/status detail).
   - `- {oid} logic: {kebab-id}` — only the Action identifier (the natural verb+noun name lives in the XML `name=`).

   Under each logic line, its composed members are indented two extra spaces with their nested oids — CRUDs, **Logic references**, and **Outputs**. **Outputs only ever appear here, indented inside a Logic — never as a top-level line**:
   - `  - {oid} crud: {action} {entity}`
   - `  - {oid} logic: {leaf-kebab-id}` — a reference to an Action defined as its own node elsewhere; only the kebab id, never re-expanded here.
   - `  - {oid} output: {brief content}` — WHAT leaves the system, in a few words; never the channel (email/sms/pdf/…).

   **A Logic reused by several BPMN nodes** (same `logic.id`, identical JSON, same oid — e.g. a shared discard reachable from three gateways) **appears exactly once in `bpmn.txt`**, under its owning business step; the reuse lives only in the XML flow. `opscale-ontology` renders it once too.

   This preserves both the atomic view (every CRUD/Output visible) and the grouped view (which Logic owns it) in one file:

   ```
   SP-01 Editorial review
   Send to review
   - SP-01-01-L01 logic: submit-for-review
     - SP-01-01-L01-C01 crud: update articles
     - SP-01-01-L01-C02 crud: create review_checklist
   Publish the article
   - SP-01-02-L01 logic: publish-article
     - SP-01-02-L01-C01 crud: read review_checklist
     - SP-01-02-L01-C02 crud: update articles
     - SP-01-02-L01-O01 output: publication notice to the author
   ```

   Every business step of every subprocess appears with ≥ 1 operation. **Why:** gates diff `process.txt` against this file to catch spec ↔ BPMN drift cheaply, without parsing XML, and `opscale-ontology` builds its tree from it.

Deliver summary:

```
BPMN generated (docs/plan/bpmn.bpmn + docs/plan/bpmn.txt).

Content:
- [n] serviceTask (CRUD)
- [n] businessRuleTask (Logic)
- [n] Outputs (composed inside Logics)
- [n] gateways

CRUD entities used: [list]
Operations defined: [list]

Validation: open https://demo.bpmn.io → File → Open → select docs/plan/bpmn.bpmn

Need adjustments?
```

Then verify the semantic gate. For the full 26-item checklist (modeling-standard recorded, every subprocess walked 2.1→2.4, no scriptTask, every CRUD entity present in DBML, every Logic name is `verb + noun`, BPMNDiagram complete, etc.), see `references/validator.md`. The skill must walk it item-by-item before declaring PASS — `opscale-sipoc` only proceeds on PASS.

**Wait for user approval before continuing.**

## Sample

Excerpt of `docs/plan/bpmn.bpmn` (with embedded metadata) and a full reference `docs/plan/bpmn.txt` (Proveedores module — supplier master lifecycle, shared across the five Plan skills — its steps match `process.txt`, its logic ids match `sipoc.txt`) — see `references/sample-output.md`.

## Success condition

```bash
node scripts/validate-bpmn.mjs docs/plan/bpmn.bpmn --txt=docs/plan/bpmn.txt --process=docs/plan/process.txt
```

Exit code 0 = pass.
