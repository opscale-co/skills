---
name: opscale-map
description: >
  Builds and maintains the app-level domain map — business lines (domains),
  their modules (subdomains), and cross-module references. Step 0.5 — after
  opscale-init, before any module's Plan phase. Trigger: "map the domains",
  "add a module to the map", "domain map", "which module owns X". Use it
  whenever the talk is about how modules group into business lines or
  reference each other, even if not asked explicitly. Not for one module's
  process (opscale-process) or data (opscale-dbml).
---

# opscale-map

## Context

### Purpose

Maintain the single app-level artifact that ties the whole ontology together above the module level:

```
Software (app)
└── Domain        = a business line (Human Resources, Finance, Sales…)
    └── Subdomain = a module — one business process, one .specify/specs/{NNN}-{slug}/ directory
```

Every other Opscale skill works **inside** one module. Nothing else records which business line a module belongs to, which modules exist or are planned, or which module owns the entities that other modules reference virtually. This skill writes that record: `.specify/memory/domain-map.md`.

**Why app-level and not per-module:** cross-module references (`external_ref:{slug}` in each module's DBML) are declared pairwise from the consumer's side. Without a central map, nobody can answer "who owns `users`?" or "what breaks if we rename `crm.agencies`?" without opening every module's `final/external-refs.md`. The map is the one place that view lives.

### Prerequisites

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init` first. |

Modules are **not** required — the map can be drawn before any module is planned, and that is the ideal moment: the domain map is the business-line inventory from which modules get chosen.

### When to run

- **First run** — right after `opscale-init`, to lay out the business lines and the candidate modules in each.
- **Re-run** — whenever a new module enters Plan, a module's external refs change (after `opscale-dbml` Phase 8), or a business line is added. The map is updated in place, never forked.

### Output

One artifact, app-level (canonical paths: `references/artifact-paths.md`):

```
.specify/memory/domain-map.md
```

Template — use exactly these section headings (downstream skills parse them):

```markdown
# Domain map — {App Name}
Updated: {ISO-8601 date}

## Domains

### {Domain name, e.g. Sales}
> {One line: what this business line does for the company}

| Subdomain (module) | Spec dir | Status | Purpose |
|---|---|---|---|
| {slug} | `.specify/specs/{NNN}-{slug}/` | planned \| plan \| generated \| released | {one line} |

## Cross-module references

| Consumer module | Contract slug | Owner ({module}.{table}) | Notes |
|---|---|---|---|
| {slug} | {contract-slug} | {module}.{table} — or "external system" | {optional} |
```

`Status` meanings: **planned** (named only), **plan** (Plan phase in progress or PASS), **generated** (Generate phase done), **released** (opscale-release done).

### Domain Rules

1. **Every module belongs to exactly one domain.** A module that seems to belong to two business lines is usually two modules — surface it and ask, don't double-list. The 1:1 assignment is what keeps the hierarchy a tree, and the tree is what management navigates.
2. **One canonical name per domain, in the business's own language.** Domains are the layer management reads; use the words the organization uses (their "People Operations", not the vendor acronym "HCM"). Aliases go in the domain's one-line description.
3. **Every contract slug in any module's `final/external-refs.md` must appear in the Cross-module references table** — with either an owning module or an explicit "external system" owner. An unmapped slug means an ownership question nobody has answered; flag it, don't guess.
4. **The map never contains module internals.** No entities, no subprocesses, no steps — those live in each module's `final/` artifacts. The map stops at the module boundary so it stays one screen long. If detail is creeping in, it belongs in a module spec.

## Steps

### Phase 1 — Inventory what exists

Read, if present: the current `.specify/memory/domain-map.md`, every `.specify/specs/{NNN}-{slug}/` directory, and each module's `final/external-refs.md`. Present the found state:

```
Current map: [exists — last updated {date} | none yet]
Modules found on disk:
- {NNN}-{slug} — [has process.md / domain.dbml / process.bpmn / actions/] → status {…}
Contract slugs declared across modules: {slug list, with consumer module each}
```

**Wait for user approval before continuing.**

### Phase 2 — Elicit the domains (business lines)

Ask which business lines the app serves and which modules (existing and planned) belong to each:

```
Which business lines (domains) does {App Name} cover?

A domain is a line of business — the level management thinks in
(e.g. Human Resources, Finance, Operations, Sales).
Each module found in Phase 1 must land in exactly one domain.
You can also name modules that don't exist yet — they enter as "planned".

For each domain: name + one-line purpose + its modules.
```

Assign every Phase 1 module. If a module fits two domains, apply Domain Rule 1: propose the split or ask which single domain owns it.

**Wait for user approval before continuing.**

### Phase 3 — Resolve cross-module ownership

For every contract slug collected in Phase 1, ask or confirm the owner:

```
Cross-module references to resolve:

| Consumer | Slug | Proposed owner |
|---|---|---|
| credits  | users    | auth.users (module: auth) |
| credits  | agencies | ??? — no module owns "agencies" yet |

For each ??? — which module (existing or planned) owns it, or is it an
external system the app will never own?
```

A slug owned by a module that is not yet on the map adds that module as **planned** in its domain (ask which). This is how the map surfaces build-order: virtual references point at what must exist eventually.

**Wait for user approval before continuing.**

### Phase 4 — Write and gate

Write `.specify/memory/domain-map.md` from the template. Replace in place; the `Updated:` line carries the run date. Then walk the gate:

```
[ ] Every module directory on disk appears in exactly one domain table
[ ] Every domain has a one-line purpose
[ ] Every contract slug from every final/external-refs.md appears in Cross-module references
[ ] Every Cross-module row has an owner (module or "external system") — no "???" left
[ ] No module internals (entities, subprocesses, steps) leaked into the map
[ ] Status column consistent with what exists in each module's final/
```

All checked → PASS. `opscale-dbml` consults this map in its Phase 2 (external references) to propose owners; `opscale-init` consults it when a new module is being named and numbered.

**Wait for user approval before finishing.**

## Sample

Excerpt of `.specify/memory/domain-map.md`:

```markdown
# Domain map — Acme ERP
Updated: 2026-07-22

## Domains

### Sales
> Wins and fulfills customer orders.

| Subdomain (module) | Spec dir | Status | Purpose |
|---|---|---|---|
| orders | `.specify/specs/001-orders/` | generated | Order intake to fulfillment |
| catalog | `.specify/specs/003-catalog/` | plan | Products and pricing |

### Finance
> Controls the money: cash, accounting, and payments.

| Subdomain (module) | Spec dir | Status | Purpose |
|---|---|---|---|
| cash | `.specify/specs/002-cash/` | released | Cash sessions and cash counts |

## Cross-module references

| Consumer module | Contract slug | Owner ({module}.{table}) | Notes |
|---|---|---|---|
| orders | products | catalog.product | |
| cash | users | auth.users — external system | IAM package |
```

## Success condition

`.specify/memory/domain-map.md` exists, gate all checked, and every contract slug across modules resolves to an owner.
