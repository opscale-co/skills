# Opscale Ontology — the vocabulary contract

Every piece of software starts as a description of business processes. This document defines the single hierarchy that ties that description (what management and users talk about) to the technical artifacts (what developers build), so all three groups look at the same thing under the same names. Every skill in this repo uses these terms with exactly these meanings — when a skill's wording and this document disagree, this document wins and the skill has a bug.

## The hierarchy

```
Software (app)
└── Domain                  a business line (Sales, Finance, Content, …)
    └── Subdomain (module)  ONE business process (Orders, Billing, Publishing, …)
        └── Subprocess      a segment of the flow, bounded by a temporal event (a wait)
            └── Step        a BUSINESS activity, broad, described in the user's language
                └── Operation   atomic and TECHNICAL — each is exactly one of:
                    ├── CRUD operation      a single create|read|update|delete on one entity
                    └── Logic operation     CRUDs (and Outputs) grouped by a business rule —
                        ├── CRUD operation    they run together, in order, as one unit
                        ├── Logic reference   another Action this Logic invokes — composition
                        │                     is RECURSIVE by reference: the leaf is defined at
                        │                     its own node (own SIPOC), never re-expanded here
                        └── Output operation  something that leaves the system (a notification,
                                              a document, a webhook) — the effect the Logic
                                              dispatches; ALWAYS composed inside a Logic
```

Only **CRUD** and **Logic** can be standalone step-level operations. An **Output is never standalone** — it is always a composed member of the Logic that produces it (you notify *because* a rule resolved).

A concrete example (same running example as `opscale-bpmn`):

```
CMS
└── Content                            (Domain)
    └── Publishing                     (Subdomain / module)
        └── Editorial review           (Subprocess)
            ├── Draft the article          (Step)
            │   └── create article              (CRUD operation — the record's
            │                                    birth with its initial status)
            ├── Send to review             (Step)
            │   └── Submit for review           (Logic operation — a status
            │       │                            transition, so never a lone CRUD)
            │       ├── update article status       (CRUD inside the Logic)
            │       └── create review checklist     (CRUD inside the Logic)
            └── Publish the article        (Step)
                └── Publish article            (Logic operation)
                    ├── read review checklist      (CRUD inside the Logic)
                    ├── update article status      (CRUD inside the Logic)
                    └── publication notice          (Output inside the Logic)
```

**Step is business; Operation is technical.** The business step is the last level a stakeholder narrates — a subprocess might have 5 business steps. Each business step decomposes into 1..N atomic operations — those 5 business steps might become 20 operations. The business step lives in `docs/plan/process.json`; the decomposition happens in `opscale-bpmn` and is recorded inside `docs/plan/bpmn.json` (operations are a nested map keyed by subprocess code → step code — both references to `process.json`, not reproduced), rendered into `docs/plan/bpmn.bpmn` (every task's `<documentation>` JSON carries the step code + subprocess name derived from those keys and `process.json`). The BPMN itself stays at operation level — business steps do not appear as BPMN elements, only as embedded metadata; the human trace lives in `bpmn.json`/`bpmn.bpmn` and in each SIPOC's `Step:` header. Events (waits) and gateways are flow elements, not operations: a wait closes a subprocess; a gateway branches the sequence.

For each module, `opscale-graph` closes the Plan phase by building this whole hierarchy as `docs/plan/graph.json` (the schema-validated source of truth: a **nested hierarchy** of `{id, ref}` nodes — `module` → `subprocesses` → `steps` → `operations` → composed `operations` — every element ref-ing the phase that owns it; island-free in the sense that *every `ref` resolves to something real*) and rendering it as `docs/plan/graph.html` (an interactive, self-contained card tree of the hierarchy) — generated exclusively from the canonical artifacts below and never edited by hand. `graph.json` carries no `module` data — `module` is a `ref` into `process.json`, the single source. Entities/enums are **not** graph nodes; they are enumerated from `dbml.json` directly (and surface as entity cards in `graph.html`). **It is the Generate phase's single source of truth**: `opscale-init`/`opscale-domain`/`opscale-logic`/`opscale-ui` read `graph.json` as the module's build manifest (the hierarchy of what to generate — Actions from its logic operations; entities/enums from `dbml.json`) and drill into `dbml.dbml`/`bpmn.bpmn`/`sipoc/` for per-node detail. No Plan skill reads it.

## Level definitions and their artifacts

| Level | Definition | Canonical artifact | Written by |
|---|---|---|---|
| **Software** | The app; a portfolio of domains | header of `docs/plan/context/system.map.md` (name + purpose); constitution in repo projects | `opscale-map` (`opscale-init` for the constitution) |
| **Domain** | A business line; groups modules; the level management navigates | `docs/plan/context/system.map.md` | `opscale-map` |
| **Subdomain** | One business process = one module = one `docs/plan/` folder = one table prefix (`MODULE_PREFIX`). "Subdomain" and "module" are synonyms everywhere | `docs/plan/` (one per module repo) | `opscale-init` (or the first Plan skill to run) |
| **Subprocess** | A wait-bounded segment of the module's flow. In the BPMN it is modeled as an **expandable `<bpmn:subProcess>` container** (one per subprocess) that can be collapsed/expanded in bpmn.io; the segment is bounded by its closing `intermediateCatchEvent`. The grouping is both structural (the container) and recorded in each operation's metadata. Becomes one browser test, one showcase walk | `docs/plan/process.json`; `docs/plan/bpmn.json` + rendered `docs/plan/bpmn.bpmn` | `opscale-process`, `opscale-bpmn` |
| **Step (business step)** | A broad business activity in the user's language — the last level a stakeholder narrates. Carries no type marker. Has a ≤25-char title + a description, and decomposes into 1..N operations | `docs/plan/process.json` (steps per subprocess) | `opscale-process` |
| **Operation** | Atomic, technical: CRUD, Logic, or Output — nested in `bpmn.json` under the subprocess + step codes it belongs to (keys referencing `process.json`); each carries its `code` and its `position` within the step (restarts at 1 per step) | `docs/plan/bpmn.json` (`operations` map) + rendered `docs/plan/bpmn.bpmn` | `opscale-bpmn` |
| **Logic composition** | The CRUD/Logic/Output list a Logic orchestrates, traced to the business rule that forces the grouping — authored in `opscale-bpmn` as each Logic's `operations` array, formalized as the module-unique **BR-NN registry** by `opscale-sipoc` (each SIPOC's `businessRules` — a `{code, text}` array). The SIPOC's *Process* **references those composed op `code`s** (each `process[].operation` is a code from the matching logic op's `operations` array) rather than restating free-text steps | `docs/plan/bpmn.json` → each Logic's `operations` array; `docs/plan/sipoc.json` → rendered `docs/plan/sipoc/{id}.md` *Process* + *Business Rules* | `opscale-bpmn`, `opscale-sipoc` |
| **The whole hierarchy** | One navigable, island-free graph of every level above for this module — the Plan closer; also the graphify-ingestible traceability graph | `docs/plan/graph.json` (nested `{id, ref}` hierarchy) + rendered `docs/plan/graph.html` | `opscale-graph` |

## The two technical views of a subdomain

From the business description of a module, exactly two technical diagrams emerge:

1. **What information the solution stores** — the domain definition: schema-validated `docs/plan/dbml.json`, rendered to `docs/plan/dbml.dbml` (the ER diagram). Reconciled against an industry **modeling standard** (BIAN, HL7 FHIR, ARTS, …) chosen in `opscale-dbml` Phase 0. The standard is what turns an as-is description (possibly with bad practices) into a robust to-be model. `dbml.json` additionally carries the module `prefix` (`MODULE_PREFIX`), a `standards` block (the chosen modeling standard — the analysis conclusion, not the name-normalization working notes, which stay in `names.md`), per-entity `permissions` predicates, mandatory `relationships`, and an optional `calculated` flag on derived fields; it holds **no audit fields** (those are added by the Generate phase) and **no `module` block** (the subdomain is derived from `process.json`, the single source).
2. **How information moves through the solution** — the flow definition: schema-validated `docs/plan/bpmn.json`, rendered to `docs/plan/bpmn.bpmn`. A sequence of tasks of exactly three types, separated by events and gateways, with each subprocess modeled as an expandable `<bpmn:subProcess>` container. Downstream it drives test cases (`opscale-ui` Browser flows), demos and menus (`opscale-showcase`).

## Operation categories ↔ artifact mapping

One concept, one name per layer. Business steps carry no type marker — `opscale-bpmn` reads each step's meaning during decomposition (a business step can decompose into operations of several categories); at the operation level the category is exact and 1:1 with the BPMN element and the generated class:

| Category | what the business step does (dominant nature) | BPMN element (per operation) | Generated class |
|---|---|---|---|
| CRUD | records something | `serviceTask` (type=crud) | Repository call |
| Logic | runs business logic / formal approval | `businessRuleTask` (type=logic) | Opscale Action (`handle()` = SIPOC Process) |
| Output | notifies / delivers a file | composed member of a Logic (type=output) — **no node** | Output class (dispatched by the Logic's Action) |
| Event | the subprocess's *Ends with:* wait | `intermediateCatchEvent` | subprocess boundary |
| Gateway | branches on a question | `exclusiveGateway` (et al.) | branch |

"Output" is the canonical category name at the technical layer. The business layer may say "notification" or "file delivery" — both map to Output. **An Output is never a BPMN node**: it is a composed member of the Logic that dispatches it (a notification is the effect of a rule resolving), so it lives in that Logic's `operations` array and is generated as an Output class the Logic's Action fires. Waits and branches are the structural elements that stay 1:1 from spec to BPMN: the wait lives on the subprocess's `*Ends with:*` line and the branch in the step's `… → N` destinations.

## The traceability spine

One ID travels the whole chain so any stakeholder can follow a concept end to end:

```
process.json business step  →  bpmn.json operation (under its step-code key; rendered bpmn.bpmn task metadata)  →  logic operation (logic.id)
    →  sipoc/{logic.id}.md (Identifier: header; linked to BPMN purely by id)  →  Action class (identifier() == logic.id)  →  test case
```

For data, the name lineage is the **entity id chain** — no maintained file, one kebab-case id per FINAL entity (assigned by `opscale-dbml` after reconciliation; ≡ the table name with dashes) stamped at every level:

```
dbml.dbml table Note ("invoice-item — …")  →  generated Model class (@entity invoice-item docblock;
    contracts: @entity ref:{slug})
```

Grep the kebab id and the whole chain comes back. `names.md` is input only — it carries no ids; when reconciliation renames an entity away from its `names.md` canonical, the table Note closes with ` (spec: {original canonical})` so the spec→final mapping survives in the artifact. `opscale-graph` assembles the chain as the entity-lineage metadata of `graph.json` (the Generate manifest, never hand-edited). For cross-module references, ownership lives in `docs/plan/context/system.map.md`.

## The id standard

Ids exist for exactly six ontology levels (see `artifact-paths.md` for the full table): domain `{xxx}` and subdomain `{xxx/yyy}` (project slugs, opscale-map), subprocess `SP-XX` and step `SP-XX-YY` (opscale-process, local numbering), entity `{kebab}` (opscale-dbml, final entities), operation `SP-XX-YY-[C|L]ZZ` (standalone crud/logic) with nested `…-[C|L|O]AA` for the CRUDs, Logic references, and Outputs composed inside a Logic (opscale-bpmn, the `code`; a composed `L` member is always a reference to an Action defined elsewhere in the flow — never a new unit). In `bpmn.json` the operations are a nested map whose subprocess (`SP-XX`) and step (`SP-XX-YY`) keys reference `process.json` rather than reproducing its subprocesses/steps. Logic operations also keep their kebab `logic.id` (the Action slug); `BR-NN` is the rule registry, not an ontology level.

## Rules that keep the ontology coherent

1. **Subdomain ≠ subprocess, and business step ≠ operation.** Subdomain is the module; subprocess is a wait-bounded segment inside its flow. Step is a broad business activity (stakeholder language, lives in `process.json`); operation is its atomic technical decomposition (lives in `bpmn.json`, rendered into `bpmn.bpmn`'s embedded metadata). Never use one for the other — each pair separates a business audience from a technical one.
2. **A Logic exists only because a business rule forces CRUDs to run together** (e.g. "an article cannot be published until every checklist item is complete" → read checklist + update article, inseparable). A Logic with zero CRUDs is suspicious; a grouping without a rule is not a Logic. **Every Output is composed inside the Logic that produces it** — a notification/document/webhook never stands alone, it is the effect a resolved rule dispatches. A corollary: **every status transition of a lifecycle entity is a Logic** — the lifecycle is a pipeline, so moving a stage always implies verifying the current stage first, and operations gated by a stage (interviewing an unscreened candidate) are Logics too. Only setting the *initial* status at creation is a plain CRUD. **A Logic never contains a `create`** — the birth of a record is always a standalone step-level CRUD; a Logic only reads, updates, deletes and dispatches Outputs (it validates against existing state and transitions it). A create inside a Logic would duplicate creation logic that already belongs to the CRUD, so `opscale-bpmn` forbids it (composed CRUD actions are `read|update|delete` only). Composition is **recursive by reference**: a Logic may compose another Logic (the SIPOC's `compose {leaf-action-id}`), but the referenced Action must exist as its own `businessRuleTask` node with its own SIPOC — a composed reference reuses a unit, it never defines one, and it is never re-expanded at the point of reuse.
3. **Decompose, then group.** Each business step is decomposed into its full flat operation sequence before any grouping into Logics (`opscale-bpmn` Phase 2.2 → 2.3), and both views persist in `docs/plan/bpmn.json` (composed CRUDs and Outputs nested under their Logic) with every operation labeled by its business step in the rendered XML metadata.
4. **Everything in `docs/plan/` is canonical and exportable.** Plan skills keep no ephemeral logs; every file they write is a consumable artifact, and no skill may take anything outside `docs/plan/` as a Plan-phase input.
5. **The spec may start as-is; the artifacts are to-be.** Standards (modeling standard in DBML, process reconciliation in BPMN Phase 1) are the mechanism that robustifies the flow — deviations from a standard are explicit decisions, never silent.
