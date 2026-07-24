# Opscale Ontology — the vocabulary contract

Every piece of software starts as a description of business processes. This document defines the single hierarchy that ties that description (what management and users talk about) to the technical artifacts (what developers build), so all three groups look at the same thing under the same names. Every skill in this repo uses these terms with exactly these meanings — when a skill's wording and this document disagree, this document wins and the skill has a bug.

## The hierarchy

```
Software (app)
└── Domain                  a business line (Sales, Finance, Content, …)
    └── Subdomain (module)  ONE business process (Orders, Billing, Publishing, …)
        └── Subprocess      a segment of the flow, bounded by a temporal event (⏳ wait)
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

**Step is business; Operation is technical.** The business step is the last level a stakeholder narrates — a subprocess might have 5 business steps. Each business step decomposes into 1..N atomic operations — those 5 business steps might become 20 operations. The business step lives in `final/process.md` (*Ordered flow*); the decomposition happens in `opscale-bpmn` and is recorded in `final/operations.md`, where every operation is labeled with its business step. The BPMN itself stays at operation level — business steps do not appear as BPMN elements; the trace lives in `operations.md` and in each SIPOC's `Step:` header. Events (⏳) and gateways (🔀) are flow elements, not operations: a wait closes a subprocess; a gateway branches the sequence.

## Level definitions and their artifacts

| Level | Definition | Canonical artifact | Written by |
|---|---|---|---|
| **Software** | The app; a portfolio of domains | `.specify/memory/constitution.md` | `opscale-init` |
| **Domain** | A business line; groups modules; the level management navigates | `.specify/memory/domain-map.md` | `opscale-map` |
| **Subdomain** | One business process = one module = one spec dir = one table prefix (`MODULE_PREFIX`). "Subdomain" and "module" are synonyms everywhere | `.specify/specs/{NNN}-{slug}/` | `opscale-init` |
| **Subprocess** | A wait-bounded (⏳) segment of the module's flow. The BPMN is flat — no `<subProcess>` container; the segment is bounded by its closing `intermediateCatchEvent` and the grouping is recorded in `final/operations.md`. Becomes one browser test, one showcase walk | `final/process.md` → *Ordered flow*; `final/process.bpmn` | `opscale-process`, `opscale-bpmn` |
| **Step (business step)** | A broad business activity in the user's language — the last level a stakeholder narrates. Carries a dominant-nature emoji. Decomposes into 1..N operations | `final/process.md` → *Ordered flow* (numbered business steps per subprocess) | `opscale-process` |
| **Operation** | Atomic, technical: CRUD, Logic, or Output — sequenced with Events (⏳) and Gateways (🔀), each labeled with the business step it came from | `final/operations.md` | `opscale-bpmn` |
| **Logic composition** | The CRUD list a Logic orchestrates, traced to the business rule (BR-NN) that forces the grouping | `final/operations.md` → *Composition*; `final/actions/{id}.sipoc.md` → *Process* | `opscale-bpmn`, `opscale-sipoc` |

## The two technical views of a subdomain

From the business description of a module, exactly two technical diagrams emerge:

1. **What information the solution stores** — the domain definition: `final/domain.dbml`. Reconciled against an industry **modeling standard** (BIAN, HL7 FHIR, ARTS, …) chosen in `opscale-dbml` Phase 0 and recorded in the DBML Project Note. The standard is what turns an as-is description (possibly with bad practices) into a robust to-be model.
2. **How information moves through the solution** — the flow definition: `final/process.bpmn`. A sequence of tasks of exactly three types, separated by events and gateways. Downstream it drives test cases (`opscale-test`), demos (`opscale-showcase`), and menus (`opscale-menu`).

## Operation categories ↔ artifact mapping

One concept, one name per layer. At the business step level the emoji marks the **dominant nature** of the business activity (a business step can decompose into operations of several categories); at the operation level the category is exact and 1:1 with the BPMN element and the generated class:

| Category | business step emoji (dominant nature) | BPMN element (per operation) | Generated class |
|---|---|---|---|
| CRUD | 📝 record | `serviceTask` (type=crud) | Repository call |
| Logic | ⚙️ logic / ✅ approval | `businessRuleTask` (type=logic) | Opscale Action (`handle()` = SIPOC Process) |
| Output | 📩 notify / 📄 file | `sendTask` (type=output) | Output class |
| Event | ⏳ wait | `intermediateCatchEvent` | subprocess boundary |
| Gateway | 🔀 decision | `exclusiveGateway` (et al.) | branch |

"Output" is the canonical category name at the technical layer. The business layer may say "notification" or "file delivery" — both map to Output. ⏳ and 🔀 are the only markers that stay 1:1 from business step to BPMN, because they are structural.

## The traceability spine

One ID travels the whole chain so any stakeholder can follow a concept end to end:

```
process.md business step  →  operations.md operations [business step label]  →  BPMN businessRuleTask (logic.id)
    →  {logic.id}.sipoc.md (Step: header)  →  Action class (identifier() == logic.id)  →  test case
```

For data, the name lineage lives in `final/naming.md`: canonical business name (process.md *Name normalization*) → DBML table → enums → model class (filled by `opscale-domain`). For cross-module references, ownership lives in `.specify/memory/domain-map.md`.

## Rules that keep the ontology coherent

1. **Subdomain ≠ subprocess, and business step ≠ operation.** Subdomain is the module; subprocess is a wait-bounded segment inside its flow. Step is a broad business activity (stakeholder language, lives in `process.md`); operation is its atomic technical decomposition (lives in `operations.md`). Never use one for the other — each pair separates a business audience from a technical one.
2. **A Logic exists only because a business rule forces CRUDs to run together** (e.g. "an article cannot be published until every checklist item is complete" → read checklist + update article, inseparable). A Logic with zero CRUDs is suspicious; a grouping without a rule is not a Logic. A corollary: **every status transition of a lifecycle entity is a Logic** — the lifecycle is a pipeline, so moving a stage always implies verifying the current stage first, and operations gated by a stage (interviewing an unscreened candidate) are Logics too. Only setting the *initial* status at creation is a plain CRUD.
3. **Decompose, then group.** Each business step is decomposed into its full flat operation sequence before any grouping into Logics (`opscale-bpmn` Phase 2.2 → 2.3), and both sequences persist in `final/operations.md` with every operation labeled by its business step.
4. **Canonical artifacts live in `final/`; `logs/` is ephemeral.** No skill may take a `logs/` file as a hard input.
5. **The spec may start as-is; the artifacts are to-be.** Standards (modeling standard in DBML, process reconciliation in BPMN Phase 1) are the mechanism that robustifies the flow — deviations from a standard are explicit decisions, never silent.
