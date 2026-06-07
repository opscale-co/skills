---
name: opscale-process
description: >
  Captures everything a module does as one connected flow of typed steps, with
  three goals: normalize the names of the things involved (so the same thing
  isn't called client / customer / user in three places), produce a standard
  ordered narrative (a flow of steps, whatever order the user told it in), and
  make every element interrelated — nothing loose. Interactive: when it finds an
  island it asks the user what it connects to. Step 1 of Plan — runs after
  opscale-init, before opscale-dbml. Trigger: "describe this module", "spec the
  module", "document how this area works", or any raw narrative of how a module
  operates. Use it whenever a module's operations must be captured and
  standardized, even if the user just rambles how the area works. Not for data
  modeling (opscale-dbml) or BPMN XML (opscale-bpmn) — it feeds them.
---

# opscale-process

## Prerequisites — MUST be satisfied before this skill runs

| Requirement | Check | If missing |
|-------------|-------|-----------|
| `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Tell the user: "Run `/opscale-init` first — `.specify/memory/constitution.md` is missing." |

Step 1 of the Plan phase. Does not run standalone.

---

## Purpose

Model a **whole module** as one connected flow — a macro-process, not a single procedure. Don't detail every sub-process; that loses the focus. Deliver exactly three things:

1. **Name normalization** — list the things involved under one readable name each, folding every synonym into it (`client / customer / user → Member`). The same real thing is named the same everywhere.
2. **A standard narrative** — reorder however the user told it (from the end, out of order, scattered) into one ordered flow of typed steps.
3. **Interrelation** — every step and every entity connects to the rest. Nothing is an island.

This is an **interactive** skill: it does not guess or silently drop. When something is loose or a name is ambiguous, it **asks**.

---

## Role & tone

You are an interactive analyst. You read how an area works, normalize the names, and lay the steps out as one connected flow. You never fill gaps by inventing: when a step or entity connects to nothing, or when two words might mean the same thing, you **stop and ask the user**, then integrate the answer. Keep the prose plain — anyone should be able to read the result.

---

## Language rule — match the input

Detect the language of the user's narrative and write everything in it — titles, steps, entity names. Entity names are **readable words in the user's language** (`Sesión de caja`, not `cash_session`).

| If the input is in… | Then write everything in… |
|---|---|
| Spanish | Spanish |
| English | English |
| Portuguese | Portuguese |
| any other language | that language |

Language-neutral (do not translate): the step emojis 📝 ⚙️ ✅ 🔀 ⏳ 📩 📄, channel keywords (`email`, `sms`, `whatsapp`, `pdf`, `webhook`, `push`, `dashboard`), and filenames/paths.

---

## Step markers

Every step in the flow carries one leading emoji — the only marker the reader needs. **Never write the type word** (`crud`, `event`, …); the emoji says what it is, and the line stays readable for anyone.

| Emoji | The step… | Feeds |
|---|---|---|
| 📝 | records something (create/update) — names an entity | opscale-dbml |
| ⚙️ | runs business logic (calculate, validate, compare) | opscale-logic |
| ✅ | is a formal approval by an authorized role | opscale-logic |
| 🔀 | branches on a question | opscale-bpmn |
| ⏳ | waits for something to arrive | opscale-bpmn |
| 📩 | sends a message out (email / sms / dashboard / …) | opscale-bpmn |
| 📄 | delivers a file (comprobante, acta, vale, report) | opscale-bpmn |

---

## Name normalization

Collect every distinct thing the narrative names. Give each **one readable canonical name** in the user's language (`Member`, `Cash session` — natural words, not `cash_session`, no DDD jargon like "aggregate" or "value object"). When the narrative uses several words for what looks like the same thing, **fold them in and confirm with the user**:

> You called it "client", "user" and "member" — are these the same thing? I'll use **Member**. OK?

Record the result as `Canonical ← alias, alias`. This list is the handoff to `opscale-dbml`; the modeling (keys, types, relations cardinality) happens there, not here.

---

## Connected flow — nothing loose

Lay the module out as one ordered flow of typed steps, grouped into natural segments (opening, … closing). Reorder whatever the user gave you into process order.

**Format: one step per line, numbered sequentially across the whole module (`1)`, `2)`, `3)`, ... — numbering does not restart per segment). Never write long arrow chains on a single line — every step is its own row.**

Connections are written by referencing step numbers, not by chaining arrows:

- **Linear:** the next-numbered step is the implicit continuation.
- **Branch (`🔀`)** — write the question on the branching line and the destinations as `Yes → N` / `No → M` on the same line (use the user's language: `Sí`, `No`, etc.). Each destination must be a step number that exists.
- **Wait (`⏳`)** — the step that resumes the flow references it back: `(after step N)`.
- **Merge** — two branches that reconverge both end pointing to the same next step number.

Every step must connect: it comes from a previous step (by number) and leads to a next one (or a branch / a wait). Every entity must appear in at least one relation. Anything mentioned but unconnected is an **island**.

**On every island, ask — never drop and never guess:**

> "[Thing]" doesn't connect to anything yet. What produces it, or what uses it?

Integrate the answer into the flow before continuing. Repeat until nothing is loose.

---

## Output

Write `spec.md` with three sections, plain titles, no rationale (translate the titles to the user's language):

- **Normalización de nombres** — the canonical list with aliases
- **Flujo relacionado** — the connected, ordered, emoji-typed flow, in segments, with **one numbered step per line** and branches written as `Yes → N / No → M` (no long arrow chains on a single line)
- **Procesos identificados** — the sub-processes inside the macro-flow (one line each: name + the flow segment / steps it spans). This list is what `opscale-bpmn` turns into subtasks, what `opscale-test` turns into one browser test each, and what `opscale-showcase` walks.
- **Relaciones** — how the entities connect

Also write `docs/process.md` — the same flow as plain narrative for humans. Use the templates in `assets/`.

Location:

```
.specify/specs/{NNN}-{module-name}/
├── spec.md
└── docs/process.md
```

---

## Workflow

### Phase 0 — Opening
One line: we'll capture the whole module as one connected flow, normalize the names, and make sure nothing is loose. Confirm.

### Phase 1 — Normalize names
List the things the narrative names; fold synonyms; **ask** to confirm each canonical name wherever there's any ambiguity.

### Phase 2 — Lay out the connected flow
Reorder the narration into one ordered flow of emoji-typed steps, grouped in segments. Then name the **sub-processes** the macro-flow contains (each is one trigger → one end inside the flow) and record which segment / steps each spans — that is the "Procesos identificados" section.

### Phase 3 — Resolve islands (interactive)
Walk every step and every entity. For each that doesn't connect, **ask** the user what it relates to and integrate the answer. Loop until nothing is loose.

### Phase 4 — Write
Confirm the normalized names and the flow, then write `spec.md` (three sections) and the derived `docs/process.md` from the templates in `assets/`, in the user's language.

---

## Keep it readable

- Plain language and readable entity names — anyone should follow it.
- The emoji is the only type marker; never write the type word.
- Don't invent: when unsure, ask.

---

## Reference

The common business-process taxonomy lives in `references/process-taxonomy.md` — consult it during Phase 1 to recognize the things and segments involved.
