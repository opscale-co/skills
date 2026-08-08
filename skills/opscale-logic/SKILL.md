---
name: opscale-logic
description: >
  Generates Opscale Action classes from the SIPOCs (or directly for standalone
  packages). Step 7 — runs after opscale-ui, before opscale-debug. Trigger:
  "generate the actions", "implement the business logic", "build the logic
  layer".
  Use it whenever Action/business-logic classes must be generated, even if just "implement the logic". Not for Nova UI (opscale-ui) or the data layer (opscale-domain).
---

# opscale-logic

## Context

### Purpose

Generate Opscale Action classes — atomic, typed, independently testable business operations built on [opscale-co/actions](https://github.com/opscale-co/actions), which extends [Laravel Actions](https://laravelactions.com).

Mode is determined by project type:

- **BPMN-driven** (app/module) — one Action per `businessRuleTask` node in `docs/plan/bpmn.bpmn`. Parameters derived from BPMN + DBML. Business rules from the SIPOCs (`docs/plan/sipoc/*.md`, section `Business Rules enforced`).
- **Standalone** (package) — Actions defined directly by name, purpose, and parameters. No BPMN or DBML files required.

The same Action class serves multiple execution contexts automatically:
- **Nova Action** — admin panel (fields inferred from `parameters()` rules + `options()`)
- **Artisan command** — terminal via `php artisan {identifier}`
- **API endpoint** — HTTP via `Route::post('/path', ActionClass::class)`
- **MCP tool** — AI agent via MCP Server registration

Output files are written to `src/Services/Actions/` and listed in `.specify/specs/{NNN}-{module-name}/plan.md` (logic section) when specs exist.

### Prerequisites

**BPMN-driven mode (app/module projects):**

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | `opscale-process` has been run | `docs/plan/process.txt` exists and PASS | Stop. Run `/opscale-process`. |
| 3 | `opscale-dbml` has been run | `docs/plan/dbml.dbml` exists and PASS | Stop. Run `/opscale-dbml`. |
| 4 | `opscale-bpmn` has been run | `docs/plan/bpmn.bpmn` exists and PASS | Stop. Run `/opscale-bpmn`. |
| 5 | `opscale-sipoc` has been run | One `docs/plan/sipoc/{kebab-id}.md` per `businessRuleTask` | Stop. Run `/opscale-sipoc`. |
| 6 | `opscale-domain` has been run | `src/Models/` populated, domain bundle tasks in `tasks.md` complete | Stop. Run `/opscale-domain`. |
| 7 | `opscale-ui` has been run | `src/Nova/` populated, Nova bundle tasks in `tasks.md` complete | Stop. Run `/opscale-ui`. |

This skill is **Step 3 (last) of the Generate phase**. Order is strict: `domain → ui → logic`. After this skill, the module is feature-complete and ready for the Review phase (`debug → test → release`).

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

In **BPMN-driven mode**, this skill consumes the per-Action SIPOC documents that `opscale-sipoc` already produced under `docs/plan/sipoc/{kebab-id}.md`. The SIPOC Inputs table feeds `parameters()`; the SIPOC Process section feeds the `handle()` body. This skill does NOT author SIPOCs — that's [opscale-sipoc](../opscale-sipoc/SKILL.md)'s job.

In **Standalone mode** (packages) there is no SIPOC: the user supplies the same information directly.

### Opscale Action Contract (opscale-co/actions ^2.2 — SIPOC-aligned)

Every Action extends `Opscale\Actions\Action`. The base class runs a SIPOC
pipeline on every adapter (Nova/API/CLI/MCP): resolve `prefill()` → validate
against `parameters()` rules → `canRun()` gate → `handle()` → validate the
return against `outputs()` → dispatch the system event when the class uses
`EmitsEvent`. The Action never calls `fill()`/`validate()` itself.

| Method | Required | SIPOC | Purpose |
|--------|----------|-------|---------|
| `identifier(): string` | YES | — | kebab-case ID — matches BPMN logic id or derived from class name. Also the name of the system event |
| `name(): string` | YES | — | Human-readable name |
| `description(): string` | YES | — | One sentence explaining the action. Written for AI/MCP context |
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

### Adapter surfaces — never override

The pipeline already translates the `Result` envelope to every surface
(Nova message/danger, HTTP 200/422, CLI output, MCP response). Do NOT
override `asNovaAction`/`getActionFields`/`asController`/`asCommand`/
`asMCPTool` — customize through `prefill()`, `options()` and rules instead.
Details and the per-adapter translation table: `references/output-context-overrides.md`.

### Nova registration — explicit, per Resource

Every generated Action with a Nova surface is automatically registered in the corresponding Resource's `actions()` method by `generate-action.mjs`. The skill never asks the LLM to manually edit a Resource to add an Action — the generator does it from the SIPOC's "Target resource(s)" line.

This keeps two facts in sync:
- the Action exists in `src/Services/Actions/{Class}.php`
- the Action is reachable from the Nova UI via the right Resource

**State-bounded visibility via `canSee`.** When the SIPOC declares a precondition like _"only available when the entity is in state X"_ (parsed from the SIPOC's Business Rules or Process section), the generator wraps the action registration with a `canSee` guard:

```php
public function actions(NovaRequest $request): array
{
    return [
        ApproveApplication::make()
            ->canSee(fn ($request) => $request->findModel()?->status?->is(ApplicationStatus::PendingReview)),
    ];
}
```

Multiple permitted states use `in_array`:

```php
ReassignTask::make()
    ->canSee(fn ($request) => in_array(
        $request->findModel()?->status,
        [TaskStatus::Open, TaskStatus::InProgress],
        strict: true,
    )),
```

When the SIPOC declares no state precondition, the action registers without a `canSee` (Nova default = always visible). The full catalogue is in `references/canSee-patterns.md`.

**Why:** an action visible in an invalid state surfaces to the operator as "click button → mysterious failure"; hiding the action at the Resource level keeps the Nova UI honest about what is doable right now.

### Code template

The authoritative template is `templates/action.php.tmpl` and the renderer is `scripts/generate-action.mjs`. The skill normalizes each Action into the JSON contract documented at the top of that script, then spawns `action-generator` (a thin wrapper that just runs the script) in parallel — one instance per Action.

The skill is responsible for assembling `handle_body` as ready-to-run PHP (including any `OtherAction::run([...])` composition calls). The script indents and inserts it verbatim — it does not transform business logic.

### Domain Rules

1. **One BPMN task = one Action class = one spec-kit task** — never merge two BPMN tasks or two standalone requests into one class, and never let a single Action span more than one entry in `tasks.md`.
2. **SIPOC is an input, not an output** (BPMN-driven mode) — every Action depends on a SIPOC under `docs/plan/sipoc/{kebab-id}.md`. This skill consumes them; `opscale-sipoc` produces them.
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
13. **`identifier()` derivation** — from BPMN `logic.id` when available, otherwise kebab-case from class name.
14. **`description()` is for AI** — write it as if explaining to an AI agent what the tool does and when to invoke it.
15. **`declare(strict_types=1)`** — every PHP file.
16. **Single-quote hygiene** — every string emitted into `identifier()`, `name()`, `description()`, and parameter `name`/`description` is wrapped in single quotes by the template. Generators MUST escape apostrophes (`'` → `\'`) on every value.
17. **Actions are registered on Resources by the generator** — every generated Action with a Nova surface (`asNovaAction`) is auto-added to the corresponding Resource's `actions()` method by `generate-action.mjs`. The skill never asks the LLM to hand-edit a Resource for this.
18. **State-bounded visibility via `canSee`** — when the SIPOC declares a precondition like _"only available when entity is in state X"_, the generator wraps the action registration with a `canSee` guard. Full pattern catalogue in `references/canSee-patterns.md`.

## Steps

### Phase 1 — Inventory SIPOCs / BPMN logic tasks

**Mode Detection:** determine the mode based on project type:
- **app/module** projects → `docs/plan/bpmn.bpmn` exists → **BPMN-driven mode**
- **package** projects → no `docs/plan/bpmn.bpmn` or spec files → **Standalone mode**

For BPMN-driven, extract every `businessRuleTask` and build the generation plan:

```
Logic Actions to generate:

| # | Task name | logic id | Subprocess | Business Rules |
|---|-----------|----------|------------|----------------|
| 1 | [name] | [kebab-id] | [subprocess] | BR-01, BR-02 |
| 2 | [name] | [kebab-id] | [subprocess] | BR-03 |
```

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

Before generating any code, formalize the plan through spec-kit so that every Action becomes a tracked task. This is what makes the implementation phase auditable and what feeds `opscale-test`.

**2a. Build the spec-kit plan input.** Compose a brief that lists every Action to be generated, in dependency order, with its source BPMN task, lane, parameters (from BPMN + DBML), and Business Rules from its SIPOC (`docs/plan/sipoc/{id}.md`). Pass this as the seed for `/speckit.plan`:

```
/speckit.plan "Logic layer for {module-name}: [N] Opscale Actions derived from
docs/plan/bpmn.bpmn. Generate one Action class per businessRuleTask. Each Action:
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

### Phase 3 — Generate Action classes

For each task in `tasks.md` (dependency order), normalize the matching SIPOC (produced by `opscale-sipoc`) into the JSON contract documented at the top of `scripts/generate-action.mjs`, then spawn `action-generator` (a thin wrapper) in parallel within each dependency level (leaves first, composites next).

**SIPOC → JSON contract mapping:**

| SIPOC section | JSON field | Notes |
|---------------|-----------|-------|
| `Identifier:` | `identifier` | kebab-case; matches BPMN `logic.id` |
| `# SIPOC — {Name}` heading | `name`, `action_class_name` | name is human text; class is PascalCase |
| First paragraph after heading | `description` | one sentence, for AI/MCP context |
| Suppliers (system-supplied entity) | `entity_param` | name of the model parameter that arrives as the Nova selection — generates the `prefill()` closure + private resolver |
| Inputs table | `parameters[]` | each row → `{name, description, type, rules}` |
| Inputs with closed domains / host-id refs | `options_entries[]` | `{param, php_expr}` — enum `array_column(...cases(), 'name', 'value')` or host contract `resolve(XContract::class)->options()`. MANDATORY for `uuid`/`identifier` params |
| Business Rules — state preconditions | `can_run_body` | raw PHP for `canRun($inputs)`: resolve entity, check states, return reason string with BR-NN or `true` |
| Composes line | `dependencies[]` | other Actions imported and called via `::run()` |
| Process section (numbered list) | `handle_body` | ordered PHP per step; in-process guards via `$this->fail()`; final `return $this->succeed([...])` assembled from Outputs |
| Outputs table | `outputs[]` | each row → `{name, description, type, rules}` — REQUIRED (abstract in ^2.2) |
| Outputs — notifications ("notificar...", "output:") | `emits_event: true` | adds `use EmitsEvent;` — the ONLY event mechanism; never manual `event()` calls |

The script handles all string escaping, parameter formatting, import ordering, and conflict detection. The skill never writes PHP — it just hands the generator the normalized JSON.

If the SIPOC file is missing for any Action in `tasks.md`, stop. Run `/opscale-sipoc` to author the missing SIPOC(s), then return here.

**Wait for user approval before continuing.**

### Phase 4 — Register on Resources with canSee wrappers

The generator already registers every Action with a Nova surface on the corresponding Resource's `actions()` method, applying `canSee` guards based on the SIPOC's state preconditions (see Context → Nova registration). Verify the wiring:

- Every Action with a Nova surface appears in exactly one Resource's `actions()` array.
- State-bounded Actions carry the expected `canSee` closure shape (single state via `->status?->is(...)`; multiple via `in_array(..., strict: true)`).
- Actions with no SIPOC state precondition register without a `canSee` guard.

Append to `.specify/specs/{NNN}-{module-name}/plan.md`:

```markdown
## Logic Layer

| File | Class | BPMN task | Task ID | Rules |
|------|-------|-----------|---------|-------|
| src/Services/Actions/[Class].php | [Class] | [task] | T-NN | BR-01 |
```

The `Task ID` column ties each generated file back to its `tasks.md` entry so `opscale-test` and `/speckit.implement` can verify completeness.

**Wait for user approval before continuing.**

### Phase 5 — Smoke gate

Action templates fail at parse time when apostrophes leak into PHP string literals, and at runtime when `identifier()` / `parameters()` return non-string values. Always run these checks:

```bash
# 0. (BPMN-driven mode) Every generated Action has a matching SIPOC
if [ -f docs/plan/bpmn.bpmn ]; then
  for f in src/Services/Actions/*.php; do
    id=$(grep -oP "return '\\K[a-z][a-z0-9-]*" "$f" | head -1)
    [ -f "docs/plan/sipoc/$id.md" ] \
      || { echo "Missing SIPOC for $id"; exit 1; }
  done
fi

# 1. Every Action file parses
find src/Services/Actions -name '*.php' -print0 \
  | xargs -0 -n1 php -l > /dev/null \
  || { echo "php -l failed"; exit 1; }

# 2. Every Action instantiates and honors the Opscale Action contract
composer dump-autoload --no-scripts > /dev/null

# 3. Composer test suite
composer test --testsuite=Unit,Feature
```

Do NOT mark the gate `PASS` based on file count — Actions with apostrophes in their description compile clean until the moment Laravel autoloads them.

**Wait for user approval before continuing.**

## Sample

Action class excerpt with `canSee` — see `references/sample-output.md`.

## Success condition

```bash
composer test --testsuite=Unit,Feature
```

Exit code 0 = pass (reflection-load loop must precede it; see Phase 5).
