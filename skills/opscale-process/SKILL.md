---
name: opscale-process
description: >
  Turns a raw account of how a module works into a connected, standardized flow,
  captured as a schema-validated process.json. Step 1 of Plan — no opscale-init
  required; feeds opscale-dbml and opscale-bpmn. Trigger: "describe this module",
  "spec the module", "formalize this process", or any rambling narrative of how
  an area operates. Use it whenever someone explains how an area works and it
  needs normalized names and an ordered flow. Not for data modeling
  (opscale-dbml) or BPMN (opscale-bpmn).
---

# opscale-process

## Context

### Purpose

Model a **whole module** as one connected flow — subprocesses bounded by waits, each decomposed into business steps. The validated source of truth is **`docs/plan/process.json`**; the diagram **`docs/plan/process.mmd`** is a deterministic projection of it (never hand-edited). Deliver:

1. **Name normalization** — fold every synonym for one real thing into a single readable canonical name (`client / customer / user → Member`), persisted to `docs/plan/context/names.md`. This table is **input** for `opscale-dbml`, which folds it into `dbml.json`'s terminology block and assigns the final entity ids — no ids are assigned here beyond the subprocess/step codes.
2. **Flow** — subprocesses (`SP-01`…, **at most 5**) each with a one-line **description**, a `trigger`, a closing wait (`endsWith`, `—` on the last), and **2–5 business steps**. Each step has a `code` (`SP-XX-YY`), a **title of at most 25 characters**, and a one-line **description**.

### The JSON contract

`process.json` is validated against `schema/process.schema.json` (which `$ref`s the shared `common.schema.json`). The schema is a hard gate — it rejects more than 5 subprocesses, a subprocess with no `description`, fewer than 2 or more than 5 steps, titles over 25 chars, missing descriptions, and malformed codes. Shape:

```jsonc
{
  "module": { "software": "...", "domain": "...", "subdomain": "comercial/ventas" },
  "subprocesses": [{                       // ≤ 5
    "code": "SP-01", "name": "Registro y calificación",
    "description": "Capta y califica la oportunidad hasta dejarla lista para ofertar.",   // one line
    "trigger": "un vendedor descubre un negocio...",
    "endsWith": "el cliente... entendimiento para ofertar",   // "—" only on the last
    "steps": [{                            // 2–5 per subprocess
      "code": "SP-01-01",
      "title": "Registrar oportunidad",    // ≤ 25 chars
      "description": "Abrir o reactivar el lead y registrar la oportunidad."
    }]
  }]
}
```

### Prerequisites

None hard. Create `docs/plan/` if missing. If `docs/plan/context/system.map.md` is absent, warn (don't block): `opscale-graph` — the Plan closer — hard-requires it, so recommend running `/opscale-map` first.

### Modes

- **Writable project folder:** writes outputs directly to `docs/plan/`.
- **Chat-only session:** produces the same files as downloadable outputs, each labeled with its destination path.

The agent-run validation gate is mandatory in both.

### How this skill runs — context, per-item questions, generate, validate

This skill enforces one hard rule: **nothing is generated until every piece is confirmed, and nothing advances past a phase whose gate has not passed.** In practice the model tends to run all phases at once — this structure prevents that by delegating the heavy, non-interactive work to sub-agents and keeping only the interview in the main conversation:

- **Phase 0 — Load context (agent).** Spawn `plan-context-loader` to read `docs/plan/` (if any) and `context/system.map.md`, returning a compact summary. Keeps large files out of the main context.
- **Phases 1–5 — Interview (main conversation, one item at a time).** Elicit the flow piece by piece. Each phase ends in an explicit **"Wait for user approval before continuing."** Subprocesses and their steps are confirmed **one subprocess at a time** — never dump the whole flow at once.
- **Phase 6 — Generate (agent).** Spawn `plan-generator` (skill: `process`) with the confirmed structure; it writes `process.json` and runs `render-process.mjs` to project `process.mmd`.
- **Phase 7 — Validate (agent).** Spawn `plan-validator` (skill: `process`); it runs `validate-process.mjs`. A failed gate is fixed and re-run, never silently patched. The skill does not close until it passes.

### Language rule — structural keys English, content in the user's language

JSON keys and codes are canonical English/ASCII. Everything the stakeholder reads — `name`, `trigger`, `endsWith`, step `title`, `description`, and `names.md` — follows the input language (Spanish narrative → Spanish content). Entity names are readable words in the user's language (`Sesión de caja`, not `cash_session`).

**Why:** the flow is reviewed by the business owner, not the engineer. Every later artifact is generated from this flow.

### Business steps — macro activities, not operations

A **business step** is a macro business activity a stakeholder would name as one coherent piece (`Integrar el archivo`, `Validar al proveedor`) — one that involves several moves (register + document + notify). It is NOT an atomic operation. One business step later decomposes into several operations (CRUD / Logic / Output) in `opscale-bpmn`.

**Litmus test.** If a candidate step reads as a single verb on a single object that becomes one create/read/update/delete or one notification (`Archivar la documentación`, `Notificar al proveedor`), it is an **operation, not a step** — fold it into the activity it belongs to. The one exception is the initial creation of the module's central entity (the record's birth), which may be a lone create.

**Titles are ≤25 characters** — so they are genuine labels, not sentences. The explanation goes in `description`. No state clauses (`… as pending`), conditions (`… according to type`), or field enumerations in the title — those resurface as operations in `opscale-bpmn`.

### Flow — nothing loose

A subprocess is a continuous sequence of steps bounded by a **wait** (a reply, a timer, a downstream answer). Notifications and file deliveries are internal steps, never boundaries. Every step connects to the rest; every entity appears in at least one step. On every island, **ask — never drop and never guess** — then integrate the answer before continuing.

### Output

```
docs/plan/
├── context/
│   └── names.md        # terminology table (canonical ← aliases; no ids — input for opscale-dbml)
├── process.json        # validated source of truth (subprocesses → steps)
└── process.mmd         # deterministic projection: Mermaid flowchart of the macro-flow
```

`names.md` — a title line (`# Names — {Module}`) and a `| Canónico | ← alias |` table (≥2 data rows, no id column). `opscale-dbml` reads it to lock the final entity names.

### Reference

The common business-process taxonomy lives in `references/process-taxonomy.md` — consult it during Phase 1.

## Steps

### Phase 0 — Load context (agent)

Spawn the `plan-context-loader` agent for this skill. It returns a compact summary of any existing `docs/plan/` artifacts and `context/system.map.md` (software/domain/module names). If `system.map.md` is missing, warn the user and recommend `/opscale-map`, but continue.

### Phase 1 — Narrative intake and name normalization

One line: we'll capture the module as one connected flow, normalize names, and make sure nothing is loose. List the things the narrative names; fold synonyms; **ask** to confirm each canonical name wherever there is ambiguity.

**Wait for user approval before continuing.**

### Phase 2 — Lock terminology

Record one `| Canonical | ← aliases |` row per distinct thing. Confirm each canonical name. (Written to `names.md` in Phase 6.)

**Wait for user approval before continuing.**

### Phase 3 — Central entity and life stages

Identify the central entity and walk its life stages in plain words — only to find the **boundaries**: between which stages does the flow wait for something external? Each wait is a subprocess-boundary candidate. Do not turn stages into a status catalog (that is `opscale-dbml`'s job).

**Wait for user approval before continuing.**

### Phase 4 — Propose subprocesses (authorization gate)

From the confirmed boundaries, propose **at most 5** subprocesses, each with a one-line `description`, its `trigger` and its `endsWith` wait. If the flow seems to need more than 5, that usually means two should merge or a boundary is not really a wait — push back and reconcile. Confirm the breakdown; it is the contract for Phase 5.

**Wait for user approval before continuing.**

### Phase 5 — Detail each subprocess (one at a time)

Walk the confirmed subprocesses **in order, one at a time**. For each, lay out its **2–5 business steps**: each with a `title` (≤25 chars, apply the litmus test) and a one-line `description`. Do not advance to the next subprocess until the current one's steps are confirmed. Resolve any island before moving on (ask what produces/uses the loose thing).

**Wait for user approval before continuing (per subprocess).**

### Phase 6 — Generate (agent)

Spawn `plan-generator` (skill: `process`) with the confirmed structure as its payload. It writes `docs/plan/process.json`, writes `docs/plan/context/names.md`, and runs `render-process.mjs` to project `docs/plan/process.mmd`. Replace existing files.

### Phase 7 — Validate (agent)

Spawn `plan-validator` (skill: `process`). It runs the gate below. If it fails, fix the JSON and regenerate — never hand-edit the `.mmd`.

## Sample

Full reference `process.json` + `process.mmd` + `names.md` (Proveedores module) — see `references/sample-output.md`.

## Success condition

```bash
node scripts/validate-process.mjs --dir=docs/plan
```

Exit code 0 = pass (1 = fail, 2 = review warnings).
