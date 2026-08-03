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
                    ├── Logic operation     CRUDs grouped by a business rule — they must run
                    │   └── CRUD operation    together, in order, as one unit
                    └── Output operation    something that leaves the system
                                            (email, PDF, webhook, SMS, download)
```

A concrete example (same running example as `opscale-bpmn`):

```
CMS
└── Content                            (Domain)
    └── Publishing                     (Subdomain / module)
        └── Editorial review           (Subprocess)
            ├── Send to review             (Step)
            │   ├── update article status      (CRUD operation)
            │   └── create review checklist    (CRUD operation)
            └── Publish the article        (Step)
                ├── Publish article            (Logic operation)
                │   ├── read review checklist      (CRUD inside the Logic)
                │   └── update article status      (CRUD inside the Logic)
                └── email the author           (Output operation)
```

**Step is business; Operation is technical.** The business step is the last level a stakeholder narrates — a subprocess might have 5 business steps. Each business step decomposes into 1..N atomic operations — those 5 business steps might become 20 operations. The business step lives in `docs/plan/process.txt`; the decomposition happens in `opscale-bpmn` and is recorded in `docs/plan/operations.md`, where every operation is labeled with its business step. The BPMN itself stays at operation level — business steps do not appear as BPMN elements; the trace lives in `operations.md` and in each SIPOC's `Step:` header. Events (waits) and gateways are flow elements, not operations: a wait closes a subprocess; a gateway branches the sequence.

For each module, `opscale-ontology` closes the Plan phase by rendering this whole hierarchy as a browsable `docs/plan/ontology.html` — a self-contained interactive tree generated exclusively from the canonical artifacts below, never edited by hand and never read by any skill.

## Level definitions and their artifacts

| Level | Definition | Canonical artifact | Written by |
|---|---|---|---|
| **Software** | The app; a portfolio of domains | header of `docs/plan/context/system.map.md` (name + purpose); constitution in repo projects | `opscale-map` (`opscale-init` for the constitution) |
| **Domain** | A business line; groups modules; the level management navigates | `docs/plan/context/system.map.md` | `opscale-map` |
| **Subdomain** | One business process = one module = one `docs/plan/` folder = one table prefix (`MODULE_PREFIX`). "Subdomain" and "module" are synonyms everywhere | `docs/plan/` (one per module repo) | `opscale-init` (or the first Plan skill to run) |
| **Subprocess** | A wait-bounded segment of the module's flow. The BPMN is flat — no `<subProcess>` container; the segment is bounded by its closing `intermediateCatchEvent` and the grouping is recorded in `docs/plan/operations.md`. Becomes one browser test, one showcase walk | `docs/plan/process.txt`; `docs/plan/logic.bpmn` | `opscale-process`, `opscale-bpmn` |
| **Step (business step)** | A broad business activity in the user's language — the last level a stakeholder narrates. Carries no type marker. Decomposes into 1..N operations | `docs/plan/process.txt` (numbered business steps per subprocess) | `opscale-process` |
| **Operation** | Atomic, technical: CRUD, Logic, or Output — sequenced with Events and Gateways, each labeled with the business step it came from | `docs/plan/operations.md` | `opscale-bpmn` |
| **Logic composition** | The CRUD list a Logic orchestrates, traced to the business rule that forces the grouping — elicited as prose by `opscale-bpmn` (`governed by:`), formalized as the module-unique **BR-NN registry** by `opscale-sipoc` (*Business Rules enforced*) | `docs/plan/operations.md` → *Composition*; `docs/plan/actions/{id}.md` → *Process* + *Business Rules enforced* | `opscale-bpmn`, `opscale-sipoc` |
| **The whole hierarchy** | One interactive view of every level above for this module — the Plan closer | `docs/plan/ontology.html` | `opscale-ontology` |

## The two technical views of a subdomain

From the business description of a module, exactly two technical diagrams emerge:

1. **What information the solution stores** — the domain definition: `docs/plan/domain.dbml`. Reconciled against an industry **modeling standard** (BIAN, HL7 FHIR, ARTS, …) chosen in `opscale-dbml` Phase 0 and recorded in the DBML Project Note. The standard is what turns an as-is description (possibly with bad practices) into a robust to-be model.
2. **How information moves through the solution** — the flow definition: `docs/plan/logic.bpmn`. A sequence of tasks of exactly three types, separated by events and gateways. Downstream it drives test cases (`opscale-test`), demos (`opscale-showcase`), and menus (`opscale-menu`).

## Operation categories ↔ artifact mapping

One concept, one name per layer. Business steps carry no type marker — `opscale-bpmn` reads each step's meaning during decomposition (a business step can decompose into operations of several categories); at the operation level the category is exact and 1:1 with the BPMN element and the generated class:

| Category | what the business step does (dominant nature) | BPMN element (per operation) | Generated class |
|---|---|---|---|
| CRUD | records something | `serviceTask` (type=crud) | Repository call |
| Logic | runs business logic / formal approval | `businessRuleTask` (type=logic) | Opscale Action (`handle()` = SIPOC Process) |
| Output | notifies / delivers a file | `sendTask` (type=output) | Output class |
| Event | the subprocess's *Ends with:* wait | `intermediateCatchEvent` | subprocess boundary |
| Gateway | branches on a question | `exclusiveGateway` (et al.) | branch |

"Output" is the canonical category name at the technical layer. The business layer may say "notification" or "file delivery" — both map to Output. Waits and branches are the only elements that stay 1:1 from spec to BPMN, because they are structural: the wait lives on the subprocess's `*Ends with:*` line and the branch in the step's `… → N` destinations.

## The traceability spine

One ID travels the whole chain so any stakeholder can follow a concept end to end:

```
process.txt business step  →  operations.md operations [business step label]  →  BPMN businessRuleTask (logic.id)
    →  actions/{logic.id}.md (Step: header)  →  Action class (identifier() == logic.id)  →  test case
```

For data, the name lineage lives in `docs/plan/naming.md`: canonical business name (`docs/plan/context/names.md`) → DBML table → enums → generated class (filled by the Generate phase). For cross-module references, ownership lives in `docs/plan/context/system.map.md`.

## Rules that keep the ontology coherent

1. **Subdomain ≠ subprocess, and business step ≠ operation.** Subdomain is the module; subprocess is a wait-bounded segment inside its flow. Step is a broad business activity (stakeholder language, lives in `process.txt`); operation is its atomic technical decomposition (lives in `operations.md`). Never use one for the other — each pair separates a business audience from a technical one.
2. **A Logic exists only because a business rule forces CRUDs to run together** (e.g. "an article cannot be published until every checklist item is complete" → read checklist + update article, inseparable). A Logic with zero CRUDs is suspicious; a grouping without a rule is not a Logic. A corollary: **every status transition of a lifecycle entity is a Logic** — the lifecycle is a pipeline, so moving a stage always implies verifying the current stage first, and operations gated by a stage (interviewing an unscreened candidate) are Logics too. Only setting the *initial* status at creation is a plain CRUD.
3. **Decompose, then group.** Each business step is decomposed into its full flat operation sequence before any grouping into Logics (`opscale-bpmn` Phase 2.2 → 2.3), and both sequences persist in `docs/plan/operations.md` with every operation labeled by its business step.
4. **Everything in `docs/plan/` is canonical and exportable.** Plan skills keep no ephemeral logs; every file they write is a consumable artifact, and no skill may take anything outside `docs/plan/` as a Plan-phase input.
5. **The spec may start as-is; the artifacts are to-be.** Standards (modeling standard in DBML, process reconciliation in BPMN Phase 1) are the mechanism that robustifies the flow — deviations from a standard are explicit decisions, never silent.
