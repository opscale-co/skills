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

Outputs are written to `.specify/specs/{NNN}-{module-name}/final/process.bpmn` (raw BPMN 2.0 XML — the diagram), `final/operations.md` (canonical operation sequence + CRUD composition per Logic — the artifact `opscale-sipoc` imports), `final/bpmn.txt` (plain list: each business step and the operations it decomposes into), and `logs/bpmn.md` (phase-by-phase Q/A record). Canonical paths: `references/artifact-paths.md`.

### Prerequisites — MUST be satisfied (ordered)

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init` first. |
| 2 | `opscale-process` has been run for this module | `.specify/specs/{NNN}-{module-name}/final/process.md` exists and PASS | Stop. Run `/opscale-process` first. |
| 3 | `opscale-dbml` has been run for this module | `.specify/specs/{NNN}-{module-name}/final/domain.dbml` exists and PASS | Stop. Run `/opscale-dbml` first. |

This skill is **Step 3 of the Plan phase**. The Plan phase is `process → dbml → bpmn → sipoc` — strictly ordered, no skipping. After `opscale-sipoc`, the module enters the Generate phase (`domain → ui → logic`).

### Allowed BPMN elements

| Category | Elements |
|----------|----------|
| Tasks | `serviceTask` (crud), `businessRuleTask` (logic), `sendTask` (output) |
| Structure | `subProcess` — one per subprocess in the spec's **Ordered flow** |
| Gateways | `exclusiveGateway`, `parallelGateway`, `inclusiveGateway`, `eventBasedGateway` |
| Events | `startEvent`, `endEvent`, `intermediateCatchEvent`, `intermediateThrowEvent` |
| Flows | `sequenceFlow`, `messageFlow` |

### Opscale Task Types

Only three task types are allowed. Everything else is forbidden.

#### serviceTask — `crud`

Persistence and query operations on domain entities via their Repository. No business logic, no conditions, no transformations. Actions are `create | read | update | delete`. **Simple queries always use `serviceTask` with `action: "read"` — never `businessRuleTask`.**

#### businessRuleTask — `logic`

Encapsulated business operation — anything **heavier than a single CRUD**. A step is `logic` when it does one or more of: queries an **external source** to proceed, requires an **approval** by an authorized role, **gathers additional data** before it can continue, **calculates / transforms** with formulas, or **coordinates multiple entities**. Maps to exactly one Opscale Action class.

**Naming — MANDATORY: `verb + noun` in natural language.** Sentence case, spaces between words, no PascalCase, no class-name form, no abbreviations. Examples: `"Calculate interest"`, `"Approve loan"`. The `id` inside `<documentation>` is the kebab-case slug derived from that phrase — downstream skills derive the Action class name from it.

#### sendTask — `output`

Dispatches something that leaves the system — email, push, PDF, SMS, WhatsApp, webhook, dashboard. Maps to exactly one Output class. One channel per task.

| Use businessRuleTask for | Use serviceTask (crud) for | Use sendTask for |
|-------------------------|---------------------------|------------------|
| Calculate totals, apply discounts | Get customer data | Send email, push, SMS, WhatsApp |
| Validate business rules | Query product list | Generate and deliver PDF reports |
| Generate sequential numbers | Read configuration | Call external webhooks |
| Apply complex transformations | Search records, simple lookups | |

For the verbatim XML snippet for each task type (with `<documentation>` payload shape), see `references/bpmn-templates.md`.

#### Forbidden task types

`userTask` · `manualTask` · `receiveTask` · `scriptTask` · `callActivity`

### General rule — the five operation categories

Operations are the atomic, technical level — what a business step decomposes into. Every operation line in every subprocess is exactly one of (the first three are **operations** proper; Event and Gateway are **flow elements** that structure the sequence):

| Category | BPMN element | What it is |
|---|---|---|
| **CRUD** | `serviceTask` (type=crud) | A single create / read / update / delete on one entity. No business rules, no orchestration |
| **Logic** | `businessRuleTask` (type=logic) | **An orchestrated bundle of CRUDs driven by a business rule** — sometimes plus an external lookup, an approval, or a calculation. The bundle is what makes it a Logic; a Logic with zero CRUDs is suspicious — re-examine it |
| **Output** | `sendTask` (type=output) | Something that leaves the system: email, push, SMS, WhatsApp, PDF, webhook, dashboard |
| **Event** | `intermediateCatchEvent` | A wait for something external to arrive |
| **Gateway** | `exclusiveGateway` (or `parallel`/`inclusive`) | A branch on a condition |

Nothing else is a step. If you cannot place a candidate step into one of these five, you have either (a) discovered a sub-step that belongs inside a Logic, or (b) something that does not belong in the BPMN at all (UI affordance, infra detail). Ask before forcing it in.

**Logic = orchestrated CRUDs.** The classic shape is a constrained state transition: a record cannot move from status A to status B freely — moving it also requires reading X, validating Y, and creating Z. Examples:

- *Submit article for review* (`submit-for-review`): `update articles.status → reviewing` + `create review_checklist`.
- *Publish article* (`publish-article`): `read review_checklist` (verify all complete) + `update articles.status → published`.
- *Approve loan* (`approve-loan`): `read credit_score` (external) + `update loan.status → approved` + `create approval_record`.

The CRUDs that compose a Logic are not separate `serviceTask` nodes in the BPMN — they live inside the Logic's `businessRuleTask`. Only CRUDs that do **not** belong to any Logic become standalone `serviceTask` nodes.

**Approvals are two-outcome.** Every ✅ approval business step implies both resolutions: the approving Logic and its rejecting counterpart (`approve-x` / `reject-x`), each with its own guarded transition and its own SIPOC, separated by the gateway that carries the decision. The same applies to any acceptance the flow waits on (an offer can be declined). Modeling only the happy path is a gap the 2.1 rules elicitation must catch — a lifecycle with an approval stage always has a rejected/declined branch somewhere.

**Lifecycle transitions are always Logic.** If an entity has a lifecycle (spec *Lifecycle* section), its status is a pipeline: a stage can only be entered from the allowed previous stage, so moving it always requires at least reading the current status and validating the transition — which is by definition more than a single CRUD. A standalone `crud: update {entity}.status` in the grouped sequence is a red flag: either it belongs inside a Logic, or the transition guard is missing from the rules elicited in 2.1. The same applies to operations gated by a status (e.g. an interview cannot be created for a candidate that has not been screened — creating it is a Logic that verifies the pipeline stage first). Creating a record with its *initial* status is not a transition — plain CRUD is fine there.

### Mapping the module spec to BPMN — business steps decompose into operations

`opscale-process` produced **business steps** — broad activities in the stakeholder's language. This skill decomposes each business step into its **atomic operations**: one business step can yield one operation or ten. The business step's emoji anticipates the *dominant* element, not a 1:1 translation:

| Spec business step (dominant nature) | Typically decomposes into |
|---|---|
| 📝 record | one or more `serviceTask` (`type=crud`) |
| ⚙️ logic | `businessRuleTask` (`type=logic`) + the CRUDs it orchestrates |
| ✅ approval | `businessRuleTask` (`type=logic`) |
| 📩 / 📄 output | `sendTask` (`type=output`) — often preceded by the CRUDs that prepare it |
| ⏳ wait | `intermediateCatchEvent` (structural — stays 1:1) |
| 🔀 decision | `exclusiveGateway` (structural — stays 1:1) |

The business step → operations trace is recorded in `final/operations.md` (every operation lists the business step it came from), so business readers can find their business step and see exactly what it became. The BPMN itself stays at operation level — business steps do not appear as BPMN elements.

**One `subProcess` per identified subprocess.** The spec's **Ordered flow** lists the subprocesses inside the module's macro-flow. Wrap each one in an embedded `subProcess` so the top-level diagram stays legible — the main flow reads as a sequence of named sub-processes, and the detailed steps live inside each. Model the **whole module**, not a single process.

### Domain rules (general rule — every task references a DBML entity)

The workflow is strictly sequential: **flows → steps per flow → BPMN**. Do not attempt to classify a single step before the user has approved (a) the list of flows and (b) the step list for the flow that step belongs to. Never generate the BPMN until every flow has been walked.

Every CRUD's entity MUST exist in `final/domain.dbml`. If it doesn't, stop and have the user fix the DBML first. Every Logic must be named **`verb + noun` in natural language** (sentence case). Every gateway branch carries a target step number on the same line.

### Output, layout, ID conventions

`final/process.bpmn` is raw BPMN 2.0 XML — no markdown wrapper, no surrounding prose. Loadable directly in Camunda Modeler or bpmn.io. The Task Summary table that previously prefaced the XML moves into `logs/bpmn.md` under Phase 3 (Final summary before generating).

For the full `<bpmn:definitions>` skeleton (process + tasks + gateway + end events + sequence flows + BPMNDiagram with shapes and edges), the layout-rules table (element widths/heights, spacing, flow direction), and the ID-prefix convention table, see `references/bpmn-templates.md`.

## Steps

### Phase 1 — Subprocess inventory (reconcile as-is flows against the systematized model)

`opscale-process` captured the subprocesses as the area runs **today** — including manual handoffs, workarounds, and informal boundaries that may exist only because no system supports the step. The BPMN must reflect the **to-be systematized** version, aligned with the modeling standard chosen in `opscale-dbml` Phase 1. Translating each as-is subprocess one-to-one into a `subProcess` is the wrong default; first contrast them against the standard and decide what to add, drop, merge, split or rename.

**1a. Read inputs:**

- `final/process.md` → the **Ordered flow** section. Each subprocess heading there is a **candidate** flow (as-is) — not a locked one.
- `final/domain.dbml` → (i) all table names (the only valid `entity` values for `serviceTask` crud) and (ii) the **modeling standard** recorded by `opscale-dbml` Phase 1 in the Project block's `Note:`. If the standard is not findable there, ask the user which one applies (or "none").

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

As-is subprocesses in final/process.md *Ordered flow*:
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

If the user accepts changes that drift from the spec (added / dropped / merged / split / renamed subprocesses), update `final/process.md` *Ordered flow* to reflect the to-be before continuing — the spec must stay in sync with what the BPMN models.

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

Walk the subprocess **step by step** (the numbered business steps in *Ordered flow*) and decompose each business step into its atomic operations: every CRUD shown individually, every output, event, and gateway in place. One business step can yield several operations — keep them grouped under their business step so the business trace survives. **No Logic yet** — that grouping happens in 2.3. Listed only, no detail, so the sequence stays readable.

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
- Every operation belongs to exactly one business step. If an operation doesn't trace to any business step in *Ordered flow*, either a business step is missing from the spec (go back and add it with the user, updating `final/process.md`) or the operation doesn't belong in the module.
- Every line is exactly one of CRUD / Output / Event / Gateway. If a candidate doesn't fit, **stop and ask** — it either belongs inside a Logic (handled in 2.3) or does not belong in the BPMN.
- Every CRUD's entity MUST exist in `final/domain.dbml`. If it doesn't, stop and have the user fix the DBML first.
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
5. Output  email author "your article is live"

Confirm the grouping?
```

Rules during 2.3:
- Every Logic must absorb at least one CRUD from the 2.2 atomic sequence. A zero-CRUD Logic is suspicious — re-examine before continuing.
- Every `update {entity}.status` on a lifecycle entity must end up inside a Logic (see *Lifecycle transitions are always Logic*). If one survives as a standalone CRUD after grouping, go back: a transition rule is missing.
- A Logic normally lives inside one business step. If a business rule forces grouping CRUDs across two business steps, surface it — the business steps may be one activity artificially split, or the rule may be mis-scoped. Ask before grouping across the boundary.
- Logics must respect the order from 2.2 — grouping collapses contiguous steps, it does not reorder them. Reordering needs to go back to 2.2.
- A CRUD that no Logic absorbs survives as a standalone CRUD line in the grouped sequence.
- Outputs, Events, and Gateways are never absorbed into a Logic — they always remain their own line.

Wait for confirmation before 2.4.

**2.4 — Detailed recap**

Expand the grouped sequence into the full detail the BPMN needs. This is the final per-subprocess artifact — once confirmed, the subprocess is locked.

```
Subprocess [n] "[Subprocess name]" — locked:

Logics (each → one businessRuleTask):
- "Submit for review" (id: submit-for-review)
    business step: "[business step from Ordered flow]"
    governed by: [rule(s) from 2.1]
    composed of:
      - update articles.status → reviewing
      - create review_checklist
- "Publish article" (id: publish-article)
    governed by: [rule(s) from 2.1]
    composed of:
      - read review_checklist (verify all complete)
      - update articles.status → published

Standalone CRUDs (each → one serviceTask):
- (none)   ← or: [crud action] on [entity]

Outputs (each → one sendTask):
- email author "your article is live" — triggered by publish-article

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

Flows (one subProcess each):
- [Flow 1] → [n steps]
- [Flow 2] → [n steps]

CRUD (serviceTask):
- [entity] → [action]   (in flow: [flow name])

Logic (businessRuleTask) — verb + noun, natural language:
- "[Verb noun]" (id: `[verb-noun]`)   (in flow: [flow name])

Output (sendTask):
- `[channel]` triggered by `[logic-id]`   (in flow: [flow name])

Flow (top level):
- Start: [trigger from spec]
- Gateways: [list]
- End: [post-conditions from spec]

DBML entities used: [list]

Generate BPMN file?
```

Never generate without explicit confirmation.

**Wait for user approval before continuing.**

### Phase 4 — Validate XML (assemble, validate, write)

Assemble the complete BPMN 2.0 XML in memory — **do not write the file yet**. Run the bundled validator (`scripts/validate-bpmn.mjs`) against the temp `.bpmn` file: exit `1` = XML/BPMN structure error, exit `2` = quality warnings (forbidden task types, missing docs, unlabelled gateway branches, orphan tasks, missing start/end events), exit `0` = proceed to write.

For the verbatim install + run commands, see `references/validator.md`.

Only after validator exits with `0`, create `logs/` and `final/` if they don't exist, then write both artifacts:

```bash
mkdir -p .specify/specs/{NNN}-{module-name}/logs .specify/specs/{NNN}-{module-name}/final
```

1. **`final/process.bpmn`** — the validated raw BPMN 2.0 XML (no markdown wrapper). This is the canonical artifact downstream skills (sipoc, logic, outputs, test) and BPMN tooling (Camunda Modeler, bpmn.io) consume directly.
2. **`final/operations.md`** — the canonical operation record, one section per locked subprocess, containing verbatim the three confirmed sequences from Phase 2: the **atomic sequence** (2.2 — every CRUD / Output / Event / Gateway individually), the **grouped sequence** (2.3 — Logics replacing their absorbed CRUDs), and the **composition detail** (2.4 — per Logic: `id`, governing rule(s), and the `composed of` CRUD list). This file — not the log — is what `opscale-sipoc` imports to build each SIPOC's Process section, so the CRUD composition survives log pruning and re-runs. Format:

   ```markdown
   # Operations — {module-name}

   ## Subprocess {n}: {name}

   ### Atomic sequence
   Step 1) "Send to review":
   1. CRUD    update articles.status → reviewing
   2. CRUD    create review_checklist
   ...

   ### Grouped sequence
   1. Logic   "Submit for review" (id: submit-for-review)   [business step 1]
   ...

   ### Composition
   - submit-for-review — business step: "Send to review" — governed by: [BR-NN]
     - update articles.status → reviewing
     - create review_checklist
   ```

   The business step labels preserve the business → technical trace: a stakeholder finds their business step and sees the operations it became; an engineer finds an operation and sees which business activity justifies it.

3. **`final/bpmn.txt`** — the same decomposition as a plain, parseable outline (no markdown, no numbering): each business step from the spec's *Ordered flow* on its own line, each operation it decomposes into below prefixed with `- ` (category word + operation), one blank line between business steps:

   ```
   Send to review
   - crud: update articles.status → reviewing
   - crud: create review_checklist

   Publish the article
   - logic: Publish article (publish-article)
   - output: email the author
   ```

   Every business step in `final/process.txt` (written by `opscale-process`) appears here with ≥ 1 operation, in the same order. **Why:** gates diff `process.txt` against this file to catch spec ↔ BPMN drift cheaply, without parsing markdown or XML.

4. **`logs/bpmn.md`** — phase-by-phase Q/A record from this run: Phase 1 modeling-standard reconciliation + subprocess-list approval, Phase 2.1–2.4 per-subprocess answers (rules, atomic sequence, grouped sequence, detailed recap), Phase 3 final-summary confirmation. Use the skeleton at `assets/log-template.md`. Replaced on each re-run.

Deliver summary:

```
BPMN file generated (final/process.bpmn + final/operations.md).

Content:
- [n] serviceTask (CRUD)
- [n] businessRuleTask (Logic)
- [n] sendTask (Output)
- [n] gateways

CRUD entities used: [list]
Operations defined: [list]

Validation: open https://demo.bpmn.io → File → Open → select final/process.bpmn

Need adjustments?
```

Then verify the semantic gate. For the full 26-item checklist (modeling-standard recorded, every subprocess walked 2.1→2.4, no scriptTask, every CRUD entity present in DBML, every Logic name is `verb + noun`, BPMNDiagram complete, etc.), see `references/validator.md`. The skill must walk it item-by-item before declaring PASS — `opscale-sipoc` only proceeds on PASS.

**Wait for user approval before continuing.**

## Sample

Excerpt of `final/process.bpmn` and a full reference `final/bpmn.txt` (recruitment module, shared across the four Plan skills — its steps match `process.txt`, its logic ids match `sipoc.txt`) — see `references/sample-output.md`.

## Success condition

```bash
node scripts/validate-bpmn.mjs final/process.bpmn
```

Exit code 0 = pass.
