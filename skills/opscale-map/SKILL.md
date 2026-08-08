---
name: opscale-map
description: >
  Builds and maintains the app-level domain map — business lines (domains),
  their modules (subdomains), and cross-module references. Step 1 — re-run
  before each module's Plan phase so its DBML sees which modules exist as
  external-reference targets. Trigger:
  "map the domains", "add a module to the map", "domain map", "which module
  owns X". Use it whenever modules group into business lines or reference
  each other. Not for one module's process (opscale-process) or data
  (opscale-dbml).
---

# opscale-map

## Context

### Purpose

Maintain the single app-level artifact that ties the whole ontology together above the module level:

```
Software (app)
└── Domain        = a business line (Human Resources, Finance, Sales…)   id: {domain-slug}
    └── Subdomain = a module — one business process, one docs/plan/ folder   id: {domain-slug}/{module-slug}
```

This skill also assigns the top two **ontology ids**: each domain gets a kebab-case project slug (`finance`) and each subdomain the composed project id `{domain}/{module}` (`finance/billing`). Downstream, `opscale-ontology` carries them in its `%% module:` metadata. Ids are stable — renaming a business line's display name does not change its slug without an explicit decision.

Every other Opscale skill works **inside** one module. Nothing else records which business line a module belongs to, which modules exist or are planned, or which module owns the entities that other modules reference virtually. This skill writes that record: `docs/plan/context/system.map.md`. One module per `docs/plan/` — multi-module apps keep one `docs/plan/` per module repo, and this map is the shared app-level view each module's plan folder carries a copy of, maintained by this skill.

**Why app-level and not per-module:** cross-module references (`external_ref:{slug}` in each module's DBML) are declared pairwise from the consumer's side. Without a central map, nobody can answer "who owns `users`?" or "what breaks if we rename `crm.agencies`?" without opening every module's `docs/plan/context/external-refs.md`. The map is the one place that view lives.

**Why it runs first, and again per module:** the map is Step 1 — the first Plan step, with no `opscale-init` required — so the business-line inventory exists before any module is planned. But it also serves *inside* a module: when `opscale-dbml` reaches its external-references phase, it needs to know **what other modules already exist** to point a virtual reference at the right owner. Re-running `opscale-map` before starting a new module refreshes that catalog — so the module being modeled can reference siblings accurately instead of inventing owners. The map is both the app-level index and the reference sheet each module consults for its external refs.

### Prerequisites

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `.specify/memory/constitution.md` (OPTIONAL) | exists in the repo | Continue — used only to prefill the software header in repo mode; without it, ask the user for name + purpose. |
| 2 | `docs/plan/context/` directory | exists | Create it. |

Modules are **not** required — the map can be drawn before any module is planned, and that is the ideal moment: the domain map is the business-line inventory from which modules get chosen.

### Modes

The mode depends on whether a writable project folder is available — not on which app is running. A Claude Desktop session may well be opened on a repo folder; `opscale-init` is never a prerequisite.

- **Writable project folder (Claude Code, or Claude Desktop on a repo/folder):** write directly to `docs/plan/context/system.map.md`, creating the folders if missing.
- **No folder access (chat-only session):** produce exactly the same file as a downloadable output, labeled with its destination path `docs/plan/context/system.map.md`; the user drops it into the repo afterwards.

**Propose → approve → write → validate.** Nothing is assumed: every phase and sub-phase ends in an explicit user approval, and no artifact is written before the user approved its content in conversation. Validators run after writing; a failed gate is fixed and re-run, never silently patched.

### When to run

- **First run** — at the very start of the Plan phase (no `opscale-init` required), to lay out the business lines and the candidate modules in each.
- **Re-run** — whenever a new module enters Plan (so its DBML can see the current module catalog for external references), a module's external refs change (after `opscale-dbml` Phase 9), or a business line is added. The map is updated in place, never forked.

### Output

One artifact, app-level (canonical paths: `references/artifact-paths.md`):

```
docs/plan/context/system.map.md
```

Template — use exactly these section headings (downstream skills parse them):

```markdown
# System map — {App Name}
> {one line: what the software does}

Updated: {ISO-8601 date}

## Domains

### {Domain name, e.g. Sales} ({domain-slug})
> {One line: what this business line does for the company}

| Id | Subdomain (module) | Location | Status | Purpose |
|---|---|---|---|---|
| {domain-slug}/{module-slug} | {slug} | `{repo}/docs/plan/` | planned \| plan \| generated \| released | {one line} |

## Cross-module references

| Consumer module | Contract slug | Owner ({module}.{table}) | Notes |
|---|---|---|---|
| {slug} | {contract-slug} | {module}.{table} — or "external system" | {optional} |
```

**Software header (mandatory):** the `> {one line: what the software does}` purpose line right under the title is the SOFTWARE HEADER the Plan phase depends on — `opscale-ontology` parses it for the top hierarchy level. In repo mode, derive the app name and purpose from `.specify/memory/constitution.md` if it exists; otherwise (Claude Desktop, or init not run) ask the user once for the software name and purpose.

`Location` is the module's repo or plan folder (e.g. `{repo}/docs/plan/`, or just `docs/plan/` for a single-repo app).

`Status` meanings: **planned** (named only), **plan** (Plan phase in progress or PASS), **generated** (Generate phase done), **released** (opscale-release done).

### Domain Rules

1. **Every module belongs to exactly one domain.** A module that seems to belong to two business lines is usually two modules — surface it and ask, don't double-list. The 1:1 assignment is what keeps the hierarchy a tree, and the tree is what management navigates.
2. **One canonical name per domain, in the business's own language.** Domains are the layer management reads; use the words the organization uses (their "People Operations", not the vendor acronym "HCM"). Aliases go in the domain's one-line description.
3. **Every contract slug in any module's `docs/plan/context/external-refs.md` must appear in the Cross-module references table** — with either an owning module or an explicit "external system" owner. An unmapped slug means an ownership question nobody has answered; flag it, don't guess.
4. **The map never contains module internals.** No entities, no subprocesses, no steps — those live in each module's `docs/plan/` artifacts. The map stops at the module boundary so it stays one screen long. If detail is creeping in, it belongs in a module spec.
5. **The map is exhaustive.** `system.map.md` lists **every** domain and **every** subdomain (module) of the software — including those not yet planned or built (they enter as `planned`). A module mentioned anywhere (narrative, external ref, roadmap) but absent from the map is a gap: ask which domain owns it and add it. A partial map does not pass the gate.

## Steps

### Phase 1 — Inventory what exists

Inventory what exists before asking. Read, if present: the current `docs/plan/context/system.map.md`, the current module's `docs/plan/` artifacts, and each known module's `docs/plan/context/external-refs.md` when reachable (other modules live in other repos and may not be). Present the found state:

```
Current map: [exists — last updated {date} | none yet]
Current module plan artifacts: [process.txt / dbml.dbml / bpmn.bpmn / sipoc/] → status {…}
Known modules (from the map): {slug — location — reachable? — external-refs read?}
Contract slugs declared across reachable modules: {slug list, with consumer module each}
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

### Phase 4 — Propose, approve, write, gate

Assemble the complete map from the template **in conversation first** and present it to the user — the full markdown, exactly as it will be written. **Wait for user approval of the assembled map before writing anything** (propose → approve → write → validate; never write an artifact before its approval).

Only after approval, write `docs/plan/context/system.map.md` (creating `docs/plan/context/` if missing; in Claude Desktop, produce the file as a downloadable labeled with that path). Replace in place; the `Updated:` line carries the run date. Then walk the gate:

```
[ ] Software header present: `> {purpose}` line right under `# System map — {App Name}`
[ ] Every domain heading carries its kebab slug (`### {Name} ({slug})`); every module row carries its project id `{domain}/{module}` in the Id column
[ ] The map is exhaustive: EVERY domain and EVERY subdomain (module) of the software appears — not just the ones being planned now; missing ones enter as `planned`
[ ] Every known module appears in exactly one domain table, with its Location
[ ] Every domain has a one-line purpose
[ ] Every contract slug from every reachable docs/plan/context/external-refs.md appears in Cross-module references
[ ] Every Cross-module row has an owner (module or "external system") — no "???" left
[ ] No module internals (entities, subprocesses, steps) leaked into the map
[ ] Status column consistent with what exists in each reachable module's docs/plan/
```

All checked → PASS. `opscale-dbml` consults this map in its Phase 3 (external references) to propose owners; `opscale-init` consults it when a new module is being named.

**Wait for user approval before finishing.**

## Sample

Excerpt of `docs/plan/context/system.map.md`:

```markdown
# System map — Acme ERP
> Runs Acme's commerce back office: orders, catalog, and cash control.

Updated: 2026-07-22

## Domains

### Sales (sales)
> Wins and fulfills customer orders.

| Id | Subdomain (module) | Location | Status | Purpose |
|---|---|---|---|---|
| sales/orders | orders | `acme-orders/docs/plan/` | generated | Order intake to fulfillment |
| sales/catalog | catalog | `acme-catalog/docs/plan/` | plan | Products and pricing |

### Finance (finance)
> Controls the money: cash, accounting, and payments.

| Id | Subdomain (module) | Location | Status | Purpose |
|---|---|---|---|---|
| finance/cash | cash | `acme-cash/docs/plan/` | released | Cash sessions and cash counts |

## Cross-module references

| Consumer module | Contract slug | Owner ({module}.{table}) | Notes |
|---|---|---|---|
| orders | products | catalog.product | |
| cash | users | auth.users — external system | IAM package |
```

## Success condition

`docs/plan/context/system.map.md` exists (or, in Claude Desktop, was delivered labeled with that path) with the software header purpose line under the title, gate all checked, every domain and subdomain of the software listed (exhaustive), and every contract slug across modules resolves to an owner.
