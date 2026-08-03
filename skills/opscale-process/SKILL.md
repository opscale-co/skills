---
name: opscale-process
description: >
  Turns a raw, unstructured account of how a module works into a connected,
  standardized flow. Step 1 of Plan — no opscale-init required; feeds
  opscale-dbml and opscale-bpmn. Trigger: "describe this module", "spec the module",
  "formalize this process", or any rambling narrative of how an area operates
  — even if no spec is asked for. Use it whenever someone explains how an area
  works and it needs normalized names and an ordered flow. Not for data
  modeling (opscale-dbml) or BPMN XML (opscale-bpmn).
---

# opscale-process

## Context

### Purpose

Model a **whole module** as one connected flow — a macro-process composed of **subprocesses bounded by waits**. The only thing that truly closes one subprocess and opens the next is having to wait for something external; everything else (notifications, file deliveries, decisions) is an internal step. Stay at the operational level. Deliver exactly three things:

1. **Name normalization** — list the things involved under one readable name each, folding every synonym into it (`client / customer / user → Member`). The same real thing is named the same everywhere. Persisted to `docs/plan/context/names.md`.
2. **Flow** — reorder however the user told it (from the end, out of order, scattered) into subprocesses with their steps; each subprocess declares the event that opens it (`Trigger:`) and the wait that closes it (`Ends with:`, `—` if it's the final subprocess). Persisted to `docs/plan/process.txt`.
3. **Interrelation** — every step and every entity connects to the rest. Nothing is an island. (Elicitation principle — connections are resolved in conversation; the data-model relations are formalized later by `opscale-dbml`.)

This is an **interactive** skill: it does not guess or silently drop. When something is loose or a name is ambiguous, it **asks**.

### Prerequisites

None hard. If `docs/plan/` doesn't exist, create it. If `docs/plan/context/system.map.md` exists, it may inform naming (module and entity names already mapped at app level), but it is not required.

Step 1 of the Plan phase.

### Modes

The mode depends on whether a writable project folder is available — not on which app is running. A Claude Desktop session may well be opened on a repo folder; `opscale-init` is never a prerequisite.

- **Writable project folder (Claude Code, or Claude Desktop on a repo/folder):** the skill writes its outputs directly to `docs/plan/`, creating the folder if missing.
- **No folder access (chat-only session):** the skill produces exactly the same files as downloadable outputs, each labeled with its destination path ("place at `docs/plan/process.txt`").

The validator gate in *Success condition* is mandatory in **both** environments — both have console access, and the script is dependency-free and runs offline from the skill bundle.

### Role & tone

You are an interactive analyst. You read how an area works, normalize the names, and lay the steps out as one connected flow. You never fill gaps by inventing: when a step or entity connects to nothing, or when two words might mean the same thing, you **stop and ask the user**, then integrate the answer. Keep the prose plain — anyone should be able to read the result.

### Language rule — structural keywords English, content in the user's language

The structural keywords (`Trigger:`, `Ends with:`) are **ALWAYS the English canonical forms** — validators and downstream skills parse them literally, so they never get translated. Everything else follows the input: detect the language of the user's narrative and write the step lines and entity names in it. Entity names are **readable words in the user's language** (`Sesión de caja`, not `cash_session`).

| If the input is in… | Then write steps and entity names in… |
|---|---|
| Spanish | Spanish |
| English | English |
| Portuguese | Portuguese |
| any other language | that language |

Language-neutral (do not translate): the structural keywords (`Trigger:`, `Ends with:`), channel keywords (`email`, `sms`, `whatsapp`, `pdf`, `webhook`, `push`, `dashboard`), and filenames/paths.

**Why:** the flow is read by the business owner, not the engineer. Jargon like `snake_case`, "entity", "aggregate", "FK", "table", "schema" breaks stakeholder review. Every later technical artifact (DBML, BPMN, SIPOC, code) gets generated from this flow, so getting the language right here cascades correctly downstream.

### Business steps

**A step here is a *business step*** — a broad activity described in the user's own words ("Validate references", "Prepare the delivery"), NOT an atomic technical operation. One business step later decomposes into one or more atomic operations (CRUD / Logic / Output) in `opscale-bpmn`, which records that decomposition in `docs/plan/operations.md` and `docs/plan/subprocesses/`. Five business steps can turn into twenty operations — that's expected. Keep business steps at the granularity the business owner narrates; do not pre-split them into technical operations here, because that swaps the audience: this flow is for stakeholders, the operation sequence is for engineers.

Steps carry **no type marker** — no emoji, no type word (`crud`, `event`, …). This skill only identifies the subprocesses, the steps inside each one, and the events that separate them. Classifying each step into operation types is `opscale-bpmn`'s job, done from the step's meaning during decomposition — a step that records something feeds `opscale-dbml` with its entity name; everything else stays a plain business activity here.

### Name normalization principle

Collect every distinct thing the narrative names. Give each **one readable canonical name** in the user's language (`Member`, `Cash session` — natural words, not `cash_session`, no DDD jargon like "aggregate" or "value object"). When the narrative uses several words for what looks like the same thing, **fold them in and confirm with the user**:

> You called it "client", "user" and "member" — are these the same thing? I'll use **Member**. OK?

Record the result as a markdown table — `| Canónico | ← alias |` header, one row per canonical name (the validator requires the table form, ≥2 data rows) — persisted to `docs/plan/context/names.md`. This table is the handoff to `opscale-dbml`; the modeling (keys, types, relations, cardinality) happens there, not here.

### Central entity and life stages — for subprocesses, NOT for enums

Identify the **central entity** of the module (the thing whose journey the module exists to drive) and its **life stages** — but ONLY as scaffolding to derive the subprocesses: each transition between stages that involves waiting for something external is a subprocess boundary candidate.

**Do NOT enumerate states as value lists, and do NOT define enums here.** Cataloging the closed set of statuses, their storage, and their names is `opscale-dbml`'s job (Enum blocks). The stages discussed here are conversational — they are not persisted as an artifact; what persists is the subprocess breakdown they produce.

### Flow — nothing loose

Lay the module out as subprocesses bounded by waits. A subprocess is a continuous sequence of steps that runs without interruption; the only thing that truly interrupts a flow is **having to wait for something external to happen** — a reply, a timer, a downstream system. That wait is the boundary, and it is recorded structurally — never as a numbered step:

- Every subprocess block carries a `Trigger:` line (the event that starts it — for the first subprocess, whatever starts the module; for the rest, the resolution of the previous wait) and an `Ends with:` line (the wait event that closes it, described in the user's language; `—` for the final subprocess).
- The `Trigger:` and `Ends with:` lines ARE the events that separate the subprocesses. Downstream, `opscale-bpmn` turns each `Ends with:` wait into the intermediate catch event joining one flow segment to the next.
- Inside each subprocess, steps flow continuously, possibly with branches, and may include notifications or file deliveries along the way — those are internal steps, never boundaries. If a notification is sent and then the flow waits for the reply, the notification is the subprocess's last step and the wait goes on the `Ends with:` line.

**Format: one step per line, numbered sequentially across the whole module (`1)`, `2)`, `3)`, ... — numbering does not restart per subprocess). Never write long arrow chains on a single line — every step is its own row.**

Connections are written by referencing step numbers, not by chaining arrows:

- **Linear:** the next-numbered step is the implicit continuation.
- **Branch** — write the question on the branching line and the destinations as `Yes → N` / `No → M` on the same line (branch labels follow the user's language: `Yes`/`No`, `Sí`/`No`, etc.). Each destination must be a step number that exists. A step with branch destinations is what `opscale-bpmn` later maps to a gateway.
- **Merge** — two branches that reconverge both end pointing to the same next step number.

Every step must connect: it comes from a previous step (by number) and leads to a next one (or a branch, or the subprocess's closing wait). Every entity must appear in at least one step. Anything mentioned but unconnected is an **island**.

**On every island, ask — never drop and never guess:**

> "[Thing]" doesn't connect to anything yet. What produces it, or what uses it?

Integrate the answer into the flow before continuing. Repeat until nothing is loose.

### Output

Two files (canonical paths: `references/artifact-paths.md`):

```
docs/plan/
├── context/
│   └── names.md     # name normalization table (canonical ← aliases)
└── process.txt      # the flow: subprocess blocks with Trigger / Ends with / numbered steps
```

**`docs/plan/context/names.md`** — a title line (`# Names — {Module}`) followed by the normalization table (`| Canónico | ← alias |`, ≥2 data rows). This is what `opscale-dbml` reads to lock entity names.

**`docs/plan/process.txt`** — plain text, no markdown, no emojis. One block per subprocess, blocks separated by one blank line:

```
{Subprocess 1 name}
Trigger: {what starts the module}
Ends with: {wait for X}
1) {step}
2) {question?} — Yes → 3 · No → 4
3) {step}
4) {step}

{Subprocess 2 name}
Trigger: the wait from {Subprocess 1 name} resolved ({X arrived})
Ends with: —
5) {step}
6) {step}
```

**Why plain text:** every downstream consumer (`opscale-bpmn` segments, `opscale-ontology` counts, `opscale-test` browser flows, `opscale-showcase` walks, `opscale-menu` grouping) parses this file cheaply — subprocess blocks by blank lines, steps by `N)` lines, events by the two keywords.

### Keep it readable

- Plain language and readable entity names — anyone should follow it.
- No type markers on steps — no emoji, no type word; the line is just the business activity.
- Don't invent: when unsure, ask.

### Reference

The common business-process taxonomy lives in `references/process-taxonomy.md` — consult it during Phase 1 to recognize the things and segments involved.

## Steps

### Phase 1 — Narrative intake and name normalization

One line: we'll capture the whole module as one connected flow, normalize the names, and make sure nothing is loose. Confirm.

List the things the narrative names; fold synonyms; **ask** to confirm each canonical name wherever there's any ambiguity.

**Wait for user approval before continuing.**

### Phase 2 — Entity normalization

Lock the canonical names and the alias mapping. Record one `| [Canonical] | [alias, alias] |` table row for every distinct thing the narrative names. Confirm each canonical name with the user.

**Wait for user approval before continuing.**

### Phase 3 — Central entity and life stages

Identify the **central entity** (the one whose journey the module drives) and walk its life stages with the user — in plain words, in the user's language. The goal is exclusively to find the **boundaries**: between which stages does the flow have to wait for something external? Each of those waits is a subprocess boundary candidate.

> Which of these entities is the one this module exists to move forward? What are the stages of its life, told as a story — and where does the flow stop to wait for something?

**Do not turn the stages into a status catalog or an enum value list** — that formalization belongs to `opscale-dbml`. Nothing from this phase is persisted directly; it feeds Phase 4.

**Wait for user approval before continuing.**

### Phase 4 — Propose subprocesses and their wait boundaries (authorization gate)

The subprocess proposal **starts from the stage transitions confirmed in Phase 3**: each transition that waits for something external frames a subprocess. Then read the narrative again to identify any additional points where the flow has to **wait** — a reply, a timer, a downstream answer, a manual handoff. Each wait is a boundary between two subprocesses. Notifications and file deliveries by themselves are NOT boundaries — they are internal steps; the boundary is only the wait that may follow them.

From that, propose the breakdown:

```
## Proposed subprocesses

1. **[Subprocess 1 name]**
   Trigger: [what starts the whole module]
   Ends with: [wait for X — e.g. "reply from the customer", "timer of 24h"]
2. **[Subprocess 2 name]**
   Trigger: the wait from Subprocess 1 resolved ([X arrived])
   Ends with: [wait for Y]
3. **[Subprocess N name]**
   Trigger: …
   Ends with: — (final subprocess; no further wait)

—
Do you confirm this breakdown? Should any subprocess be split, merged, or renamed?
Did I miss any waits (timers, replies, external answers) that should add a boundary?
Are there notifications or file deliveries currently shown as boundaries that are actually just internal steps?
```

The breakdown the user confirms here is the contract: every step in Phase 5 lives inside exactly one of these subprocesses.

**Wait for user approval before continuing.**

### Phase 5 — Detail each subprocess

Once authorized, walk each subprocess in order and lay out its numbered steps — plain business activities, no type markers. A subprocess is a continuous chain of internal steps; the wait that closes it lives on its `Ends with:` line, never as a numbered step (the final subprocess ends with its last internal step and `Ends with: —`). When a notification triggers a wait, the notification is the last numbered step and the wait stays on the `Ends with:` line. Numbering is sequential across the whole module; it does not restart per subprocess.

**Wait for user approval before continuing.**

### Phase 6 — Resolve islands (interactive)

Walk every step and every entity. For each that doesn't connect, **ask** the user what it relates to and integrate the answer. Loop until nothing is loose.

**Wait for user approval before continuing.**

### Phase 7 — Finalize and write

Confirm the normalized names and the flow, then write the two files in the user's language:

1. `docs/plan/context/names.md` — the title line and the normalization table (create `docs/plan/context/` if missing).
2. `docs/plan/process.txt` — the subprocess blocks exactly as described in Output.

Replace either file if it already exists. The flow the user confirmed and the file contents must never disagree.

**Wait for user approval before continuing.**

## Sample

Full reference `docs/plan/process.txt` + `docs/plan/context/names.md` (recruitment module, shared across the Plan skills so the lists chain) — see `references/sample-output.md`.

## Success condition

```bash
node scripts/validate-process.mjs --process-txt=docs/plan/process.txt --names-file=docs/plan/context/names.md
```

Exit code 0 = pass.
