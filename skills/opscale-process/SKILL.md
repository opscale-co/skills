---
name: opscale-process
description: >
  Turns a raw, unstructured account of how a module works into one connected,
  standardized spec. Step 1 of Plan — after opscale-init, feeds opscale-dbml
  and opscale-bpmn. Trigger: "describe this module", "spec the module",
  "formalize this process", or any rambling narrative of how an area operates
  — even if no spec is asked for. Use it whenever someone explains how an area
  works and it needs normalized names and an ordered flow. Not for data
  modeling (opscale-dbml) or BPMN XML (opscale-bpmn).
---

# opscale-process

## Context

### Purpose

Model a **whole module** as one connected flow — a macro-process composed of **subprocesses bounded by a wait (`⏳`)**. The only thing that truly closes one subprocess and opens the next is having to wait for something external; everything else (notifications, file deliveries, decisions) is an internal step. Stay at the operational level. Deliver exactly three things:

1. **Name normalization** — list the things involved under one readable name each, folding every synonym into it (`client / customer / user → Member`). The same real thing is named the same everywhere.
2. **Ordered flow** — reorder however the user told it (from the end, out of order, scattered) into one ordered flow of typed steps, grouped by subprocess; each subprocess ends with the `⏳` that closes it (or with its last internal step if it's the final subprocess of the module).
3. **Interrelation** — every step and every entity connects to the rest. Nothing is an island.

This is an **interactive** skill: it does not guess or silently drop. When something is loose or a name is ambiguous, it **asks**.

### Prerequisites — MUST be satisfied before this skill runs

| Requirement | Check | If missing |
|-------------|-------|-----------|
| `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Tell the user: "Run `/opscale-init` first — `.specify/memory/constitution.md` is missing." |

Step 1 of the Plan phase. Does not run standalone.

### Role & tone

You are an interactive analyst. You read how an area works, normalize the names, and lay the steps out as one connected flow. You never fill gaps by inventing: when a step or entity connects to nothing, or when two words might mean the same thing, you **stop and ask the user**, then integrate the answer. Keep the prose plain — anyone should be able to read the result.

### Language rule — headings English, content in the user's language

Section headings and structural keywords (`Stages:`, `Flows:`, "ends at") are **ALWAYS the English canonical forms** — validators and downstream skills parse them literally, so they never get translated. Everything else follows the input: detect the language of the user's narrative and write the prose, step lines, and entity names in it. Entity names are **readable words in the user's language** (`Sesión de caja`, not `cash_session`).

| If the input is in… | Then write prose, steps, and entity names in… |
|---|---|
| Spanish | Spanish |
| English | English |
| Portuguese | Portuguese |
| any other language | that language |

Language-neutral (do not translate): the canonical section headings and structural keywords (`Stages:`, `Flows:`, "ends at"), the step emojis 📝 ⚙️ ✅ 🔀 ⏳ 📩 📄, channel keywords (`email`, `sms`, `whatsapp`, `pdf`, `webhook`, `push`, `dashboard`), and filenames/paths.

**Why:** the spec is read by the business owner, not the engineer. Jargon like `snake_case`, "entity", "aggregate", "FK", "table", "schema" breaks stakeholder review and forces the business owner to ask developers what their own spec says. The spec must stand on its own as a business document — every later technical artifact (DBML, BPMN, SIPOC, code) gets generated from it, so getting the language right here cascades correctly downstream.

### Step markers

**A step here is a *business step*** — a broad activity described in the user's own words ("Validate references", "Prepare the delivery"), NOT an atomic technical operation. One business step later decomposes into one or more atomic operations (CRUD / Logic / Output) in `opscale-bpmn`, which records that decomposition in `final/operations.md`. Five business steps can turn into twenty operations — that's expected. Keep business steps at the granularity the business owner narrates; do not pre-split them into technical operations here, because that swaps the audience: this spec is for stakeholders, the operation sequence is for engineers.

Every business step carries one leading emoji — the only marker the reader needs. The emoji marks the business step's **dominant nature** (what it mainly does), which orients the downstream decomposition; it is not a 1:1 operation type. **Never write the type word** (`crud`, `event`, …); the emoji says what it is, and the line stays readable for anyone.

| Emoji | The business step mainly… | Feeds |
|---|---|---|
| 📝 | records something (create/update) — names an entity | opscale-dbml |
| ⚙️ | runs business logic (calculate, validate, compare) | opscale-logic |
| ✅ | is a formal approval by an authorized role | opscale-logic |
| 🔀 | branches on a question | opscale-bpmn |
| ⏳ | waits for something to arrive | opscale-bpmn |
| 📩 | sends a message out (email / sms / dashboard / …) | opscale-bpmn |
| 📄 | delivers a file (receipt, certificate, voucher, report) | opscale-bpmn |

### Name normalization principle

Collect every distinct thing the narrative names. Give each **one readable canonical name** in the user's language (`Member`, `Cash session` — natural words, not `cash_session`, no DDD jargon like "aggregate" or "value object"). When the narrative uses several words for what looks like the same thing, **fold them in and confirm with the user**:

> You called it "client", "user" and "member" — are these the same thing? I'll use **Member**. OK?

Record the result as `Canonical ← alias, alias`. This list is the handoff to `opscale-dbml`; the modeling (keys, types, relations cardinality) happens there, not here.

### Lifecycle modeling principle

Lifecycles travel forward into the subprocess proposal: each lifecycle flow becomes a candidate subprocess, and each subprocess MUST end at a recognizable stage transition (the `⏳` boundary is what holds the entity at one stage until the next flow advances it).

### Ordered flow — nothing loose

Lay the module out as one ordered flow of typed steps, grouped into **subprocesses bounded by a wait (`⏳`)**. A subprocess is a continuous sequence of steps that runs without interruption; the only thing that truly interrupts a flow is **having to wait for something external to happen** — a reply, a timer, a downstream system. That wait (`⏳`) is the boundary.

| Emoji | Role in the boundary |
|---|---|
| 📝 ⚙️ ✅ 🔀 📩 📄 | **Internal step** — runs inside a subprocess, never breaks it. Sending a notification (`📩`) or delivering a file (`📄`) is just a step the subprocess performs and keeps going. |
| ⏳ | **Boundary event** — the flow pauses until something arrives. The current subprocess ends here; the next subprocess starts because the wait resolved. |

So:

- The module = N subprocesses connected by `⏳` waits.
- Inside each subprocess, steps flow continuously, possibly with branches (🔀), and may include notifications (📩) or file deliveries (📄) along the way.
- A subprocess ends only when the flow has to wait. If a notification is sent and then the flow has to wait for the reply, write them in that order — **first `📩` (notify), then `⏳` (wait)** — and the `⏳` is what closes the subprocess.
- If a subprocess simply finishes the module (no further wait), it ends with its last internal step, not with a boundary event.

**Format: one step per line, numbered sequentially across the whole module (`1)`, `2)`, `3)`, ... — numbering does not restart per subprocess). Never write long arrow chains on a single line — every step is its own row.**

Connections are written by referencing step numbers, not by chaining arrows:

- **Linear:** the next-numbered step is the implicit continuation.
- **Branch (`🔀`)** — write the question on the branching line and the destinations as `Yes → N` / `No → M` on the same line (branch labels follow the user's language: `Yes`/`No`, `Sí`/`No`, etc.). Each destination must be a step number that exists.
- **Wait (`⏳`)** — the step that resumes the flow references it back: `(after step N)`.
- **Merge** — two branches that reconverge both end pointing to the same next step number.

Every step must connect: it comes from a previous step (by number) and leads to a next one (or a branch / a wait). Every entity must appear in at least one relation. Anything mentioned but unconnected is an **island**.

**On every island, ask — never drop and never guess:**

> "[Thing]" doesn't connect to anything yet. What produces it, or what uses it?

Integrate the answer into the flow before continuing. Repeat until nothing is loose.

### Output

Two siblings under the spec directory — phase log + final artifact. Canonical paths defined in `references/artifact-paths.md`.

```
.specify/specs/{NNN}-{module-name}/
├── logs/process.md     # phase-by-phase Q/A record from this run
└── final/process.md    # the canonical, downstream-consumable spec
```

**`logs/process.md`** — phase-by-phase record of what was asked and answered during this run (Phase 1 name normalization, Phase 2a subprocess boundary confirmation, Phase 2b per-subprocess step lists, Phase 3 island resolutions). Use the shared skeleton at `assets/log-template.md`. Replaced on each re-run.

**`final/process.md`** — the canonical spec with **five sections**, plain titles, no rationale (section headings and structural keywords stay in English; prose, step lines, and entity names follow the user's language):

- **Name normalization** — the canonical list with aliases
- **Lifecycle** — per lifecycle entity: its **Stages** and **Flows** (the transitions that drive it from stage to stage). Confirmed in Phase 2.5 and persisted here so downstream skills can trace every subprocess back to the stage transition it implements
- **Ordered flow** — the macro-flow, grouped into **subprocesses bounded by events**. Each subprocess is its own heading with a *Trigger* line and its numbered business steps inside — broad activities that `opscale-bpmn` later decomposes into atomic operations. The subprocess headings ARE the identified processes, and the numbered steps under each ARE the detailed flow. `opscale-bpmn` turns each subprocess heading into one `subProcess`; `opscale-test` turns each into one browser test; `opscale-showcase` walks each one.
- **Relations** — how the entities connect
- **Narrative** — the same flow in plain prose for humans to read first; downstream skills parse the structured sections above.

Use the template in `assets/spec-template.md`.

### Keep it readable

- Plain language and readable entity names — anyone should follow it.
- The emoji is the only type marker; never write the type word.
- Don't invent: when unsure, ask.

### Reference

The common business-process taxonomy lives in `references/process-taxonomy.md` — consult it during Phase 1 to recognize the things and segments involved.

## Steps

### Phase 1 — Narrative intake and name normalization

One line: we'll capture the whole module as one connected flow, normalize the names, and make sure nothing is loose. Confirm.

List the things the narrative names; fold synonyms; **ask** to confirm each canonical name wherever there's any ambiguity.

**Wait for user approval before continuing.**

### Phase 2 — Entity normalization

Lock the canonical names and the alias mapping. Record `Canonical ← alias, alias` for every distinct thing the narrative names. Confirm each canonical name with the user.

**Wait for user approval before continuing.**

### Phase 2.5 — Lifecycle modeling

Before laying out subprocesses, model the **lifecycle** of the entities that actually have one. Lifecycles travel forward into the subprocess proposal: each lifecycle flow becomes a candidate subprocess, and each subprocess MUST end at a recognizable stage transition (the `⏳` boundary is what holds the entity at one stage until the next flow advances it).

**Step A — Pick the lifecycle entity.** Default: every aggregate root identified in Phase 1 (the canonical names that other entities hang off of). When the narrative is unclear about which entities truly carry a lifecycle and which are just supporting data, **ask**:

> Which of these entities have a lifecycle (change stage over time) and which are just supporting data? I suggest these three: …

Wait for the user to confirm the lifecycle entity list before moving on.

**Step B — Identify life stages.** For each lifecycle entity, list its stages in plain words in the user's language — never technical state names. Stages flow left-to-right. Example:

```
Application: Draft → In review → Approved → Cancelled
```

Confirm the stages with the user before listing flows.

**Step C — Identify flows.** Each flow is a verb+noun phrase in the user's language (`send to review`, `approve application`, `cancel application`) and **every flow MUST terminate at a stage transition** — otherwise the flow is loose. When a candidate flow has no terminal stage, it is an **orphan flow**: stop and ask the user to either name the terminal stage or merge the flow into another:

> "Verify documents" doesn't end at any stage — should it end at `In review`, should it be part of `send to review`, or is it an internal business step with no transition?

Repeat per lifecycle entity until every flow has a terminal stage. Record the result inline; it feeds directly into Phase 3.

**Wait for user approval before continuing.**

### Phase 3 — Propose subprocesses and their wait boundaries (authorization gate)

The subprocess proposal **starts from the flows confirmed in Phase 2.5**: each lifecycle flow is a candidate subprocess that drives the entity from one stage to the next, framed with a `⏳` wait boundary on the side that waits for the next external trigger. Then read the narrative again to identify any additional points where the flow has to **wait** for something external — a reply, a timer, a downstream answer, a manual handoff. Each wait is a `⏳` boundary between two subprocesses. Notifications (`📩`) and file deliveries (`📄`) by themselves are NOT boundaries — they are internal steps; they only become a boundary if a `⏳` immediately follows them.

From that, propose the breakdown:

```
## Proposed subprocesses

1. **[Subprocess 1 name]**
   Trigger: [what starts the whole module]
   Ends with: ⏳ [wait for X — e.g. "reply from the customer", "timer of 24h"]
2. **[Subprocess 2 name]**
   Trigger: the wait from Subprocess 1 resolved ([X arrived])
   Ends with: ⏳ [wait for Y]
3. **[Subprocess N name]**
   Trigger: …
   Ends with: — (final subprocess; no further wait)

—
Do you confirm this breakdown? Should any subprocess be split, merged, or renamed?
Did I miss any waits (timers, replies, external answers) that should add a boundary?
Are there notifications or file deliveries currently shown as boundaries that are actually just internal steps?
```

The breakdown the user confirms here is the contract: every step in Phase 4 lives inside exactly one of these subprocesses.

**Wait for user approval before continuing.**

### Phase 4 — Detail each subprocess

Once authorized, walk each subprocess in order and lay out its numbered typed steps. A subprocess is a continuous chain of internal steps (`📝 ⚙️ ✅ 🔀 📩 📄`) and ends with the `⏳` that closes it (or with its last internal step if it's the final subprocess of the module). When a notification triggers a wait, write **`📩` first, then `⏳`** — both belong to the same subprocess and `⏳` is the boundary. Numbering is sequential across the whole module; it does not restart per subprocess.

**Wait for user approval before continuing.**

### Phase 5 — Resolve islands (interactive)

Walk every step and every entity. For each that doesn't connect, **ask** the user what it relates to and integrate the answer. Loop until nothing is loose.

**Wait for user approval before continuing.**

### Phase 6 — Finalize and write

Confirm the normalized names and the flow, then write both files in the user's language:

1. `logs/process.md` — render the phase-by-phase Q/A from Phases 1, 2, 2.5, 3, 4, 5 using the skeleton in `assets/log-template.md`. One section per phase; **Question / Answer / Decision** triplet per material exchange.
2. `final/process.md` — render the five-section spec (**Name normalization**, **Lifecycle**, **Ordered flow**, **Relations**, **Narrative**) using `assets/spec-template.md`.

Create `logs/` and `final/` if they don't exist. Replace either file if it already exists.

**Wait for user approval before continuing.**

## Sample

Excerpt of `final/process.md` — see `references/sample-output.md`.

## Success condition

```bash
node scripts/validate-process.mjs --process-file=.specify/specs/*/final/process.md
```

Exit code 0 = pass.
