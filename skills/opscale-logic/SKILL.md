---
name: opscale-logic
description: >
  Generates Opscale Action classes from the SIPOCs (or directly for standalone
  packages), then their Feature tests. Step after opscale-domain, before
  opscale-ui. Trigger: "generate the actions", "implement the business logic",
  "build the logic layer".
  Use it whenever Action/business-logic classes must be generated, even if just "implement the logic". Not for Nova UI (opscale-ui) or the data layer (opscale-domain).
---

# opscale-logic

## Context

### Purpose

Generate Opscale Action classes — atomic, typed, independently testable business operations built on [opscale-co/actions](https://github.com/opscale-co/actions), which extends [Laravel Actions](https://laravelactions.com).

Mode is determined by project type:

- **BPMN-driven** (app/module) — one Action per **first-level `logic` operation** in `docs/plan/bpmn.json` (equivalently, each first-level operation in the `docs/plan/graph.json` hierarchy — `subprocesses[].steps[].operations[]` — whose `ref` resolves to a `bpmn.json` operation of `type:"logic"`). Parameters, process, outputs and rules come from the matching entry in `docs/plan/sipoc.json`; entity/field detail from `docs/plan/dbml.json`.
- **Standalone** (package) — Actions defined directly by name, purpose, and parameters. No Plan JSON files required.

The same Action class serves multiple execution contexts automatically:
- **Nova Action** — admin panel (fields inferred from `parameters()` rules + `options()`)
- **Artisan command** — terminal via `php artisan {identifier}`
- **API endpoint** — HTTP via `Route::post('/path', ActionClass::class)`
- **MCP tool** — AI agent via MCP Server registration

This skill also generates the **Feature tests** for every Action it produces (`tests/Feature/{ActionName}Test.php`) — the layer that used to live in `opscale-test`. Each Action ships with its test in the same run.

Output files are written to `src/Services/Actions/` (+ `tests/Feature/`) and listed in `.specify/specs/001-mvp/plan.md` (logic section) when specs exist.

### Prerequisites

**BPMN-driven mode (app/module projects):**

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | `opscale-process` has been run | `docs/plan/process.json` exists and PASS (`validate-process.mjs`) | Stop. Run `/opscale-process`. |
| 3 | `opscale-dbml` has been run | `docs/plan/dbml.json` exists and PASS (`validate-dbml.mjs`) | Stop. Run `/opscale-dbml`. |
| 4 | `opscale-bpmn` has been run | `docs/plan/bpmn.json` exists and PASS (`validate-bpmn.mjs`) | Stop. Run `/opscale-bpmn`. |
| 5 | `opscale-sipoc` has been run | `docs/plan/sipoc.json` exists — one `sipocs[]` entry per BPMN first-level `logic` operation (`validate-sipoc.mjs`) | Stop. Run `/opscale-sipoc`. |
| 6 | The Plan graph has been generated | `docs/plan/graph.json` exists — the hierarchy manifest that indexes every Logic (first-level operation resolving to a `bpmn.json` `type:"logic"`, unique kebab `id`) (`validate-graph.mjs`) | Stop. Generate the graph. |
| 7 | `opscale-domain` has been run | `src/Models/` populated **and factories exist** (`database/factories/`), domain bundle tasks in `tasks.md` complete — Feature tests seed through these factories | Stop. Run `/opscale-domain`. |

This skill is **Step 2 of the Generate phase**. Order is strict: `domain → logic → ui`. `opscale-logic` runs **before** `opscale-ui`: the Nova Resources do not exist yet when the Actions are generated — registering each Action on its Resource (with a `canSee` guard) is `opscale-ui`'s job, not this skill's. After `opscale-ui`, the module is feature-complete and ready for the Review phase (`debug → test → release`).

**Standalone mode (package projects):**

Prerequisite 1 (`opscale-init`) still applies. Spec files are not required — the user provides:
- Action names and purposes
- Parameter definitions (types, validation rules)
- Business logic description
- Package namespace and output directory

### Generator contract — scaffold, then customize

The generator in `scripts/` **minimizes the code the LLM writes** — it scaffolds the Action shell (contract, parameters, output methods) from the SIPOC. You then **always customize the one thing a template cannot anticipate: the `handle()` body** — the real business logic the SIPOC describes.

Rule: run the generator to scaffold, then write the `handle()` body (and any `OtherAction::run([...])` composition) from the SIPOC's typed Process steps.

### Output file structure

```
src/
└── Services/
    └── Actions/
        └── {ActionClassName}.php    (one per businessRuleTask or standalone action)
```

In **BPMN-driven mode**, this skill consumes the SIPOC objects that `opscale-sipoc` already produced in `docs/plan/sipoc.json` (`sipocs[]`, one per BPMN first-level `logic` operation). Each SIPOC's `inputs[]` feeds `parameters()`; its `process[]` feeds the `handle()` body; `outputs[]` feeds `outputs()`; `businessRules[]` (`{code, text}`) + `failureModes` feed `canRun()`/`fail()`. This skill does NOT author SIPOCs — that's [opscale-sipoc](../opscale-sipoc/SKILL.md)'s job. The rendered `docs/plan/sipoc/<id>.md` files are projections; read `sipoc.json`.

In **Standalone mode** (packages) there is no SIPOC: the user supplies the same information directly.

### Opscale Action Contract (opscale-co/actions ^2.2 — SIPOC-aligned)

Every Action extends `Opscale\Actions\Action`. The base class runs a SIPOC
pipeline on every adapter (Nova/API/CLI/MCP): resolve `prefill()` → validate
against `parameters()` rules → `canRun()` gate → `handle()` → validate the
return against `outputs()` → dispatch the system event when the class uses
`EmitsEvent`. The Action never calls `fill()`/`validate()` itself.

| Method | Required | SIPOC | Purpose |
|--------|----------|-------|---------|
| `identifier(): string` | YES | — | **`{MODULE_PREFIX}.{sipoc.id}`** (e.g. `ventas.approve-quote`) — prefix from `.specify/memory/constitution.md` (as the other generators read it). Also the name of the system event |
| `name(): string` | YES | — | Human-readable name — wrapped in `__()` with key `{prefix}.{id}.name`, seeded into both `lang/en.json` and `lang/es.json` |
| `description(): string` | YES | — | One sentence for AI/MCP context — wrapped in `__()` with key `{prefix}.{id}.desc`, seeded into both locales |
| `parameters(): array` | YES | Inputs | Typed input declarations with validation rules |
| `handle(array $inputs = []): array` | YES | Process | Business logic — receives VALIDATED inputs; returns `$this->succeed([...])` or `$this->fail('reason')` |
| `outputs(): array` | YES | Outputs | Output schema, same shape as `parameters()`. The success payload of `handle()` is validated against it |
| `prefill(): array` | optional | Suppliers | System-supplied parameters. Values may be Closures invoked with the adapter context (Nova: object with `->models` Collection of selected records; API: Request; CLI: Command; MCP: MCP Request). A Closure returning null is dropped so the caller value survives. Prefilled params are hidden from every adapter's input surface |
| `options(): array` | optional | Inputs | Choice lists per parameter: Nova Select, MCP `enum`, CLI `choice()` |
| `canRun(array $inputs): bool\|string` | optional | pre-P gate | State preconditions ("only from status X"). Return `true` to run or a reason string to soft-fail. Never throws |
| `use EmitsEvent;` | optional | Clients | When the SIPOC declares an output/notification: the pipeline dispatches `event("{identifier}", [$outputs])` after every success |

### parameters() format

Each parameter is an associative array with four keys: `name`, `description`, `type`, `rules`.

```php
public function parameters(): array
{
    return [
        [
            'name'        => 'entity',
            'description' => 'Description for AI/MCP context — be specific',
            'type'        => ModelClass::class,
            'rules'       => ['required'],
        ],
        [
            'name'        => 'title',
            'description' => 'The title of the item',
            'type'        => 'string',
            'rules'       => ['required', 'string', 'max:255'],
        ],
    ];
}
```

Type conventions:
- Eloquent model inputs: `ModelClass::class`
- Scalar inputs: `'string'`, `'int'`, `'bool'`, `'array'`
- Use `exists:table,id` rule for FK references

### handle() contract

```php
public function handle(array $inputs = []): array
{
    $entity = $this->entity($inputs);   // private resolver — see below

    if (! $entity instanceof Entity) {
        return $this->fail('Entity not found.');
    }

    // business logic (DB::transaction around multi-write mutations)

    return $this->succeed([
        // keys matching outputs()
    ]);
}
```

Rules:
- `handle()` receives VALIDATED inputs — never call `fill()`/`validate()`/`get()`
- Success: `return $this->succeed([...])` with exactly the keys declared in `outputs()` (no `success` key — the adapter adds it)
- Soft failure in-process: `return $this->fail('reason')`
- Hard failure (invalid state / bug): throw an exception — let it bubble
- State preconditions do NOT live in `handle()` — they live in `canRun()`, returning the reason string (include the BR-NN code)
- Model parameters need a private resolver because the same input arrives in three shapes: the model instance (prefill from the Nova selection), an `Illuminate\Support\Collection` (the Nova adapter also injects the selected models under the model's snake_case name as an extra), or a plain id (API/CLI/MCP):

```php
private function entity(array $inputs): ?Entity
{
    $entity = $inputs['entity'] ?? null;

    if ($entity instanceof Collection) {
        $entity = $entity->first();
    }

    if ($entity instanceof Entity) {
        return $entity;
    }

    return is_string($entity) ? Entity::query()->find($entity) : null;
}
```

- Events: never dispatch manually — add `use EmitsEvent;` when the SIPOC declares an output/notification; the pipeline dispatches `event("{identifier}", [$outputs])` after success (post-transaction)
- Compose with other Actions via `OtherAction::run(['param' => $value])`
- No HTTP context, no `request()` helper — handle() is context-free
- `Auth::id()` is allowed only when the business rule explicitly requires knowing who triggered it

### Nova field inference (v2.2) — options are mandatory for id parameters

The Nova adapter infers each field from the parameter's rules and type:
`in:`/`exists:` → Select, `mimes:`/`mimetypes:` → File/Image with
`acceptedTypes`, `date` (+`_at` name or time tokens) → DateTime vs Date,
`numeric`+monetary name or `decimal:2` → Currency, `array` → KeyValue (or
MultiSelect when options are provided), long `max:` → Textarea.

**Trap:** a `uuid`/`identifier` parameter with NO options source renders as an
empty Select with a warning — the operator must never type a raw id. Give
every id parameter an options source: `options()` (host contracts like
`UsersContract` when the id references host data), a per-parameter
`options` key, or an `exists:` rule.

### Option/relation/id parameters are never free `Text`; Actions never create

An **enum** param → a Select with `options()`; a **relation / host-id** param
(`type:"identifier"`, or an `externalRef`/`foreignKey` column) → an option-backed
Select (`resolve({Host}Contract::class)->options()` cross-module, or
`{Model}::query()->pluck('name','id')->all()` for a local catalog) **or** an
`exists:{table},id` rule. `generate-action.mjs` fails generation when a param
flagged `requires_options` ships neither — the `ApproveQuote.approver` bug class
(an actor picked from another module is a Select, never a `['required','string']`
free Text). The **entity_param** (the `source:"System"`+`type:"identifier"`
prefilled record) is exempt. The assembler also asserts no `create` op in the
SIPOC `process[]`: record creation is a Nova create form (CRUD) authored by
`opscale-ui`, not an Action.

### i18n — namespaced KEYS seeded into BOTH `lang/en.json` AND `lang/es.json`

Everything the caller/operator reads is translatable (`name()`, `description()`,
each parameter/output `description`, every `canRun()`/`fail()`/exception
message), wrapped in `__()` with a namespaced key
`{prefix}.{id}.{name|desc|param.<p>|output.<o>|fail.<n>}`. The assembler OWNS the
key scheme and seeds `key → en` into `lang/en.json` and `key → es` into
`lang/es.json` in one pass (mirroring opscale-ui; existing keys never
overwritten). Values come from `action-translations-generator`; an absent
override falls back to the English string so neither file ships a gap. The
technical parameter/output `name` stays untranslated — it is the array key.

### Adapter surfaces — never override

The pipeline already translates the `Result` envelope to every surface
(Nova message/danger, HTTP 200/422, CLI output, MCP response). Do NOT
override `asNovaAction`/`getActionFields`/`asController`/`asCommand`/
`asMCPTool` — customize through `prefill()`, `options()` and rules instead.
Details and the per-adapter translation table: `references/output-context-overrides.md`.

### Nova registration is deferred to opscale-ui

This skill runs **before** `opscale-ui`, so the Nova Resources do not exist yet — there is nothing for an Action to register onto. This skill therefore **does NOT register Actions on Resources**. It generates the Action classes under `src/Services/Actions/` and stops there.

Registering each Action with a Nova surface on the corresponding Resource's `actions()` method — including the `canSee` state-visibility guard derived from the SIPOC's state preconditions — is **`opscale-ui`'s responsibility** when it later builds the Resources. `opscale-ui` reads the same SIPOC Business Rules / Process preconditions and applies the wrapper.

Because of this, the skill never passes a `nova_registration` block to `generate-action.mjs`; the generator still creates `src/Services/Actions/{Class}.php` as usual. The `canSee` pattern catalogue lives in `references/canSee-patterns.md` — retained here as the handoff contract for `opscale-ui`.

**Why the guard matters (for opscale-ui):** an action visible in an invalid state surfaces to the operator as "click button → mysterious failure"; hiding the action at the Resource level keeps the Nova UI honest about what is doable right now. The `canRun()` gate this skill DOES generate is the authoritative enforcement; the `canSee` opscale-ui adds is the UI affordance built from the same rule.

### Code template — a fleet of single-concern section agents → one assembler

Generation is **always deterministic**. An Action is no longer built by one
monolithic generator: like a Nova Resource in `opscale-ui`, it is assembled from
the structured contributions of a **fleet of single-concern section agents**,
each reading only its narrow `sipoc.json` / `dbml.json` slice and returning a
JSON fragment. The authoritative template is `templates/action.php.tmpl`; the
deterministic **assembler** is `scripts/generate-action.mjs` (JSON contract in
its header). `action-generator` is the thin wrapper that runs the assembler on
the merged input.

| Agent | Concern | Reads | Emits |
|-------|---------|-------|-------|
| `action-identifier-generator` | identity + classification | sipoc (`id`,`title`,`description`,`inputs`,`outputs`) + bpmn logic op | `identifier` (slug), `action_class_name`, `entity_param`, `entities`, `dependencies`, `emits_event`, `process` (for the no-create assertion) |
| `action-parameters-generator` | `parameters[]` + `options_entries[]` | sipoc `inputs[]` + dbml enums/entities + business-types binding + external-refs | `parameters[]` (with `requires_options` flags), `options_entries[]` — forbids free Text for option/relation/id params |
| `action-outputs-generator` | `outputs[]` | sipoc `outputs[]` + dbml entities | `outputs[]` (mirrors the SIPOC Outputs table) |
| `action-translations-generator` | contextual i18n (EN+ES values) | sipoc title/description/inputs/outputs/businessRules/failureModes | `translations` = `{name,desc,param.<p>,output.<o>,fail.<n>}` EN/ES values |

The `handle()` / `canRun()` BODIES are NOT a rule-slice — they are the real
business logic the SIPOC `process[]`/`businessRules[]` describe. The skill still
authors them via the existing `action-generator` flow, as ready-to-run PHP
(including any `OtherAction::run([...])` composition); it only **wraps their
messages in `__('{prefix}.{id}.fail.<n>')`** so the translations agent can seed
them. The assembler indents and inserts the bodies verbatim — it never transforms
business logic.

### Domain Rules

1. **One BPMN task = one Action class = one spec-kit task** — never merge two BPMN tasks or two standalone requests into one class, and never let a single Action span more than one entry in `tasks.md`.
2. **SIPOC is an input, not an output** (BPMN-driven mode) — every Action depends on a `sipocs[]` object in `docs/plan/sipoc.json`. This skill consumes them; `opscale-sipoc` produces them.
3. **Spec-kit plan + tasks before code** — `/speckit.plan` and `/speckit.tasks` run BEFORE any `action-generator` agent is spawned.
4. **Every implementation task has a preceding test task** — `tasks.md` lists `Test {ClassName}` immediately before `Implement {ClassName}`.
5. **handle() receives validated inputs** — never `fill()`/`validate()`/`get()`; read `$inputs` directly and resolve model params through the private resolver (instance | Collection | id).
6. **succeed()/fail() envelope** — success returns `$this->succeed([...outputs()...])`; controlled failure returns `$this->fail('reason')`. Never a raw `['success' => bool]` array.
7. **State preconditions → canRun(), process failures → fail(), invalid state → throw** — every SIPOC "only from status X" precondition becomes a `canRun()` reason string with its BR-NN code.
8. **outputs() mirrors the SIPOC Outputs table** — mandatory; the pipeline validates the success payload against it. SIPOC notifications/outputs → `use EmitsEvent;` (no manual `event()` calls).
9. **No KeyValue inputs** — no action parameter may render as a Nova KeyValue. A multiple choice is a MultiSelect against a closed catalog (enum labels via `options()`, per-element `in:` rule, JSON normalization of Nova's MultiSelect in `fill()`); per-element data is either auto-generated (title from the type's label, generated tracking codes) or promoted to its own scalar parameter. Open key-value maps invite incoherent data.
10. **Never override the adapter methods** — `asNovaAction()`, `asController()`, `asCommand()`, `asMCPTool()` are the pipeline; the old manual "map selected model + translate success to message/danger" override is replaced by a `prefill()` closure (`fn ($ctx) => $ctx?->models?->first()`).
11. **Compose via `::run()`** — generate leaf actions before composite actions.
12. **handle() is context-free** — no `request()`, no `redirect()`, no HTTP assumptions.
13. **`identifier()` = `{MODULE_PREFIX}.{sipoc.id}`** — e.g. `ventas.approve-quote`; prefix from `.specify/memory/constitution.md`. The assembler prepends it; agents return the bare slug. It is also the system-event name, so events are module-namespaced.
14. **`description()` is for AI** — write it as if explaining to an AI agent what the tool does and when to invoke it. It is still translatable (key `{prefix}.{id}.desc`, both locales).
15. **`declare(strict_types=1)`** — every PHP file.
16. **Everything translatable, both locales** — `name()`, `description()`, each parameter/output `description`, and every `canRun()`/`fail()`/exception message are wrapped in `__()` with namespaced keys `{prefix}.{id}.{name|desc|param.<p>|output.<o>|fail.<n>}`, seeded into BOTH `lang/en.json` and `lang/es.json`. The technical parameter/output `name` is the array key and stays untranslated. Apostrophes in authored body messages are the author's responsibility; translated values live in JSON (no PHP single-quote hazard).
20. **Option/relation/id params are never free `Text`** — an enum param → Select with `options()`; a relation/host-id param (`type:"identifier"` or an `externalRef`/`foreignKey`) → option-backed Select or an `exists:` rule. The assembler FAILS generation when a `requires_options` param ships neither. The prefilled entity_param is exempt.
21. **An Action never creates a record** — the assembler asserts no `create` op in the SIPOC `process[]`. Record creation is a Nova create form (CRUD) authored by `opscale-ui`, not an Action.
17. **Actions are NOT registered on Resources here** — `opscale-ui` runs after this skill, so the Resources do not exist yet. This skill only writes `src/Services/Actions/{Class}.php` (+ its Feature test) and never passes `nova_registration` to the generator. `opscale-ui` performs the registration when it builds the Resources.
18. **`canSee` state-visibility is opscale-ui's job** — the SIPOC state precondition this skill encodes into `canRun()` is the same rule `opscale-ui` later turns into a `canSee` guard on the Resource. The pattern catalogue in `references/canSee-patterns.md` is the handoff contract for that step.
19. **One Action = one Feature test** — every generated Action ships a `tests/Feature/{ActionName}Test.php` that exercises `Action::run()` against a real DB (factories from `opscale-domain`, no DB mocks) and covers the four cases: positive, negative, false-positive, false-negative.

## Steps

### Phase 1 — Inventory Logics from the graph manifest, then the SIPOC/BPMN detail

**Mode Detection:** determine the mode based on project type:
- **app/module** projects → `docs/plan/bpmn.json` exists → **BPMN-driven mode**
- **package** projects → no `docs/plan/bpmn.json` or spec files → **Standalone mode**

For BPMN-driven mode the **graph is the manifest** — the source of truth for *which* Actions exist. `sipoc.json` + `bpmn.json` are the *detail* for each one.

**1a. Enumerate the Logics from the graph.** Walk the `docs/plan/graph.json` hierarchy — `subprocesses[].steps[].operations[]` — and collect every **first-level** operation whose `ref` resolves to a `bpmn.json` operation of `type:"logic"` (its `bpmn.json` entry has an `id`, a `rules[]`, and nested composed `operations[]`). Take the **unique kebab `id`s** (the logic `id` field in `bpmn.json`) as the definitive set of Actions to generate — a composed operation that reuses a logic `id` inside another Logic is the same Action reused, not a new one; dedupe by kebab id. This count is the manifest that every later phase reconciles against.

**1b. Pull the detail per Logic.** For each unique kebab id, read its `docs/plan/sipoc.json` object (`sipocs[]` where `id` == the logic id): `inputs[]` → `parameters`, `process[]` → `handle` body, `outputs[]` → `outputs()`, `businessRules[]` (`{code, text}`) + `failureModes` → `canRun` state gate. Cross-reference the matching `bpmn.json` operation (`operations[].id` == the logic id) for its composed `operations[]` (each a `crud` with `entity`+`action`, a `logic` ref, or an `output`). Build the generation plan:

```
Logic Actions to generate (from graph manifest):

| # | Action name | logic id | Subprocess | Business Rules |
|---|-------------|----------|------------|----------------|
| 1 | [name] | [kebab-id] | [SP-XX] | BR-01, BR-02 |
| 2 | [name] | [kebab-id] | [SP-XX] | BR-03 |
```

If the number of unique logic `id`s in the graph manifest does not match the number of `sipocs[]` entries in `docs/plan/sipoc.json`, stop — the Plan is inconsistent; re-run the missing Plan skill (or regenerate the graph) before continuing.

**1c. Business-type check on every parameter (explicit).** Each Action input must be **typed with a business type**, not a raw scalar. Each `sipoc.json` input (`inputs[].type`) carries the business-type **slug** from `docs/plan/context/business-types.md`; the executable binding for that slug (field, validation rules, cast) lives in `.specify/memory/business-types.php`. Before generating, verify for every parameter:

```
[ ] Each parameter's sipoc.json inputs[].type is a business-type slug (not a bare varchar/text/decimal)
[ ] Every slug used exists in .specify/memory/business-types.php (the binding)
[ ] The binding's `rules` are folded into the parameter's `rules` array
[ ] Model/FK/id params use identifier (exists:table,id), never a free string
```

If a slug is missing from `.specify/memory/business-types.php`, stop and add it to the binding (or re-run the Plan skill that owns it) before generating — an untyped parameter cannot be validated.

**Authorization from `dbml.json` permissions.** The entity an Action writes carries a `permissions` block in `docs/plan/dbml.json` (`{ "create": <predicate>, "update": <predicate>, "delete": <predicate> }`, predicate strings over the entity's own fields, e.g. `"status != won and status != lost"`). When an Action's primary write is a `create`/`update`/`delete` on that entity, fold the matching predicate into the Action's `canRun()` gate (alongside the SIPOC state preconditions) so the write is refused in a state the data model forbids. `true`/`false` predicates are trivial (always/never). This is the authoritative guard; `opscale-ui` renders the same predicates as `authorizedTo*`/`canSee` affordances.

Then resolve dependency order — when an Action calls another Action:

```
Dependency graph:
  [LeafAction1]       — no dependencies
  [LeafAction2]       — no dependencies
  [CompositeAction]   — calls LeafAction1, LeafAction2

Generate order: LeafAction1 → LeafAction2 → CompositeAction
```

For Standalone mode, follow the standalone variant in `references/standalone-mode.md`.

**Wait for user approval before continuing.**

### Phase 2 — Drive spec-kit plan + tasks

Before generating any code, formalize the plan through spec-kit so that every Action becomes a tracked task in the MVP feature (`.specify/specs/001-mvp/`). This is what makes the implementation phase auditable. Each Action gets an `Implement` task **and** a preceding `Test` task (this skill generates that Feature test itself — see Phase 4).

**2a. Build the spec-kit plan input.** Compose a brief that lists every Action to be generated, in dependency order, with its source BPMN `logic` operation, parameters (from `sipoc.json` `inputs[]` + `dbml.json`), and Business Rules from its SIPOC (`sipoc.json` `businessRules[]`). Pass this as the seed for `/speckit.plan`:

```
/speckit.plan "Logic layer for {module-name}: [N] Opscale Actions derived from
docs/plan/bpmn.json. Generate one Action class per first-level logic operation. Each Action:
- extends Opscale\\Actions\\Action (opscale-co/actions ^2.2)
- declares identifier(), name(), description(), parameters(), handle(), outputs()
  (+ prefill()/options()/canRun()/EmitsEvent per its SIPOC)
- lives in src/Services/Actions/{ClassName}.php

Dependency order:
  1. [LeafAction1] (no deps)
  2. [LeafAction2] (no deps)
  3. [CompositeAction] (calls LeafAction1, LeafAction2)
  ...

Source BPMN tasks: [list of logic ids]
Source Business Rules: [BR-01, BR-02, ...]"
```

Read the resulting `plan.md` and confirm with the user before continuing.

**2b. Generate per-Action tasks with `/speckit.tasks`.** Each Action MUST land as exactly one task in `tasks.md`. The task contract is:

| Task field | Value |
|------------|-------|
| Title | `Implement {ActionClassName}` |
| Description | First line of the Action's `description()` |
| Inputs | DBML entities + scalars from `parameters()` |
| Outputs | Return-array keys |
| Acceptance | Business Rules (BR-NN) the Action enforces |
| Depends on | Task IDs of leaf Actions this composes |
| Test task | `Test {ActionClassName}` — precedes the implementation task |

Verify `tasks.md`:

```
[ ] One task per Action — count matches the inventory
[ ] Each task title starts with 'Implement '
[ ] Each task has a matching 'Test ' task preceding it
[ ] Dependency edges match the composition graph from Phase 1
[ ] Every Action's Business Rules appear in its task's acceptance criteria
```

If any check fails, regenerate tasks.md before continuing.

**Wait for user approval before continuing.**

### Phase 3 — Generate Action classes (fleet of section agents → assembler)

Generation is **always deterministic**. Per Action, do not normalize one giant
JSON blob by hand — **derive the shared inputs once, then fan out the four
section agents in parallel**, author the bodies, merge, assemble, gate. Entities
within one dependency level run fully in parallel (leaves first, composites next
so `::run()` targets already exist).

**3a. Derive the shared inputs** for the Action (once):
- `prefix` — `MODULE_PREFIX` from `.specify/memory/constitution.md` (as the other
  generators read it).
- `sipoc` — the `sipocs[]` object where `id` == the logic id.
- `bpmn_op` — the first-level `logic` operation (`operations[].id` == the logic
  id) with its composed `operations[]`.
- `dbml` — the enums + the entity each input/output resolves to.
- `business_types_binding` + `external_refs` — `.specify/memory/business-types.php`
  and `docs/plan/context/external-refs.md`.

**3b. Fan out the four section agents IN PARALLEL** (see the fleet table in Code
template). Each reads only its slice and returns a JSON fragment:
`action-identifier-generator` → identity/classification; `action-parameters-generator`
→ `parameters[]` + `options_entries[]` (with the free-Text ban); `action-outputs-generator`
→ `outputs[]`; `action-translations-generator` → `translations` (EN/ES values).

**3c. Author the bodies.** The `handle()`/`canRun()` bodies are business logic,
not a rule-slice — the skill writes them as ready-to-run PHP from the SIPOC
`process[]`/`businessRules[]`/`failureModes` (+ the entity's `dbml.json`
`permissions` predicate folded into `canRun()`). Every message is wrapped
`__('{prefix}.{id}.fail.<n>')`; list those `<n>` short names so the translations
agent seeds them. Composition is `OtherAction::run([...])` from `composes[]` / the
bpmn logic's composed `logic` refs.

**3d. Merge + assemble.** Fold the four contributions + the bodies into one
`generate-action.mjs` input (contract in the script header: `prefix`,
`identifier` slug, `action_class_name`, `name`/`description` EN fallbacks,
`parameters` with `requires_options`, `options_entries`, `outputs`, `entities`,
`dependencies`, `entity_param`, `emits_event`, `process`, `can_run_body`,
`handle_body`, `translations`). Spawn `action-generator` (the thin assembler
wrapper) on it. The assembler prefixes `identifier()`, wraps name/description/
params/outputs/messages in namespaced `__()` keys, seeds BOTH `lang/en.json` and
`lang/es.json`, enforces the option/relation/id → options()/exists: rule, asserts
no `create` in `process[]`, and handles all string escaping, import ordering and
conflict detection. The skill never writes PHP — it hands over the merged JSON.

**Do NOT include a `nova_registration` block.** `opscale-ui` runs after this skill, so the target Resources do not exist yet. Omit `nova_registration` entirely — the generator writes only `src/Services/Actions/{Class}.php`. `opscale-ui` performs the `actions()` + `canSee` registration later, reading the same SIPOC state preconditions.

If a `sipocs[]` object is missing from `docs/plan/sipoc.json` for any Action in `tasks.md`, stop. Run `/opscale-sipoc` to author the missing SIPOC(s), then return here.

**Wait for user approval before continuing.**

### Phase 4 — Generate the Feature tests (one per Action)

Every Action generated in Phase 3 ships its own Feature test. This is the layer that used to live in `opscale-test`; it now runs here so an Action and its proof land together. Spawn the `feature-test-generator` agent (it exists) in parallel — **one instance per Logic/Action** — writing `tests/Feature/{ActionName}Test.php`.

**Each Feature test MUST explicitly cover the four cases.** For an Action, they mean:

| Case | Meaning for an Action | Shape of the test |
|------|-----------------------|-------------------|
| **Positive** | Preconditions valid → the expected business effect happens | seed a factory in the valid state, `Action::run([...])`, assert `success: true`, assert the persisted state change (`->fresh()`) and any emitted event |
| **Negative** | A precondition is invalid → the Action rejects / soft-fails | seed a factory in an invalid state (wrong status, missing relation), `Action::run([...])`, assert `success: false` with the `canRun()`/`fail()` reason (BR-NN), assert **no** state change and **no** event |
| **False-positive** | Inputs *look* valid but a business rule must still reject them | seed data that passes shape validation yet violates a BR (e.g. duplicate, out-of-window, over-limit), assert the Action rejects it — proves the rule fires, not just the type check |
| **False-negative** | Inputs *look* invalid on the surface but the rule must let them through | seed an edge case that resembles a rejection but is legitimately allowed (e.g. boundary-equal amount, re-run that is genuinely idempotent), assert `success: true` — proves the rule is not over-strict |

Generation contract:
- **Name the four cases explicitly** so both a reader and the gate can find them: `it('positive: …')`, `it('negative: …')`, `it('false-positive: …')`, `it('false-negative: …')`.
- **Seed via factories** produced by `opscale-domain` (`{Model}::factory()->create([...])`) — never hand-build models.
- Invoke the Action through the **`executeAction($class, [...])` helper** (from `tests/Helpers.php`, a thin wrapper over `::run()`) against the real DB (in-memory SQLite from the test harness) — **no DB mocks**, never call `handle()` directly.
- Assert **persisted business state** (`->fresh()` field/status) **and events** (`Event::fake([...])` + `assertDispatched('{identifier}')` / `assertNotDispatched('{identifier}')`, matching the string identifier the `EmitsEvent` pipeline emits) — not just the return envelope.
- One business concern per `it()`; add an extra `it()` per Business Rule (BR-NN) the Action enforces, beyond the four canonical cases, as applicable.
- Spawn the generator with `action_class`, `action_path`, `parameters`, `logic_rules` (the BR-NN set), `models_involved`, `composed_actions`, `events_expected`, `package_namespace`, and `output_dir=tests/Feature`.

Append to `.specify/specs/001-mvp/plan.md`:

```markdown
## Logic Layer

| Action file | Test file | Class | logic id | Task ID | Rules |
|-------------|-----------|-------|----------|---------|-------|
| src/Services/Actions/[Class].php | tests/Feature/[Class]Test.php | [Class] | [kebab-id] | T-NN | BR-01 |
```

The `Task ID` column ties each generated file back to its `tasks.md` entry in `.specify/specs/001-mvp/` so `/speckit.implement` and the later Review phase can verify completeness.

**Wait for user approval before continuing.**

### Phase 5 — Gate (linters + Feature tests green)

Action templates fail at parse time when apostrophes leak into PHP string literals, and at runtime when `identifier()` / `parameters()` return non-string values. A Feature test that never ran proves nothing. Run every check:

```bash
# 0. Every generated Action has a matching Feature test (ALWAYS — standalone too);
#    the SIPOC check applies only in BPMN-driven mode.
for f in src/Services/Actions/*.php; do
  [ -e "$f" ] || continue
  cls=$(basename "$f" .php)
  t="tests/Feature/${cls}Test.php"
  [ -f "$t" ] || { echo "Missing Feature test for $cls"; exit 1; }
  # the four canonical cases must be present by name
  for case in "positive" "negative" "false-positive" "false-negative"; do
    grep -q "it('${case}:" "$t" || { echo "$t: missing '${case}' case"; exit 1; }
  done
  # real-DB state + events, not just the return envelope
  grep -q -- '->fresh()'  "$t" || { echo "$t: no persisted-state assertion"; exit 1; }
  grep -q 'Event::assert' "$t" || { echo "$t: no event assertion"; exit 1; }
  # SIPOC only exists in BPMN-driven mode
  if [ -f docs/plan/bpmn.json ]; then
    # identifier() is now "{prefix}.{sipoc-id}" — strip the module prefix to the slug.
    full=$(grep -oP "return '\\K[a-z][a-z0-9.-]*" "$f" | head -1)
    id="${full##*.}"
    grep -q "\"id\"[[:space:]]*:[[:space:]]*\"$id\"" docs/plan/sipoc.json || { echo "Missing SIPOC for $id in sipoc.json"; exit 1; }
  fi
done

# 1. Every Action file parses
find src/Services/Actions -name '*.php' -print0 \
  | xargs -0 -n1 php -l > /dev/null \
  || { echo "php -l failed"; exit 1; }

# 2. Autoload + honor the Opscale Action contract
composer dump-autoload --no-scripts > /dev/null

# 3. Linters (Duster + PHPStan via the project's lint/analyse scripts)
composer lint && composer analyse

# 4. Feature suite must be green
composer test --testsuite=Feature
```

Do NOT mark the gate `PASS` based on file count — Actions with apostrophes in their description compile clean until the moment Laravel autoloads them. The gate is green only when the linters pass **and** `composer test --testsuite=Feature` exits 0.

**Wait for user approval before continuing.**

## Sample

Action class excerpt + Feature test covering the four cases — see `references/sample-output.md`.

## Success condition

```bash
composer test --testsuite=Feature
```

Exit code 0 = pass (linters + reflection-load loop must precede it; see Phase 5).
