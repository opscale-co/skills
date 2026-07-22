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

- **BPMN-driven** (app/module) — one Action per `businessRuleTask` node in `final/process.bpmn`. Parameters derived from BPMN + DBML. Business rules from `final/process.md`.
- **Standalone** (package) — Actions defined directly by name, purpose, and parameters. No BPMN or DBML files required.

The same Action class serves multiple execution contexts automatically:
- **Nova Action** — admin panel via `asNovaAction()` + `getActionFields()`
- **Artisan command** — terminal via `php artisan {identifier}`
- **API endpoint** — HTTP via `Route::post('/path', ActionClass::class)`
- **MCP tool** — AI agent via MCP Server registration

Output files are written to `src/Services/Actions/` and listed in `.specify/specs/{NNN}-{module-name}/plan.md` (logic section) when specs exist.

### Prerequisites

**BPMN-driven mode (app/module projects):**

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | `opscale-process` has been run | `final/process.md` exists and PASS | Stop. Run `/opscale-process`. |
| 3 | `opscale-dbml` has been run | `final/domain.dbml` exists and PASS | Stop. Run `/opscale-dbml`. |
| 4 | `opscale-bpmn` has been run | `final/process.bpmn` exists and PASS | Stop. Run `/opscale-bpmn`. |
| 5 | `opscale-sipoc` has been run | One `final/actions/{kebab-id}.sipoc.md` per `businessRuleTask` | Stop. Run `/opscale-sipoc`. |
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

In **BPMN-driven mode**, this skill consumes the per-Action SIPOC documents that `opscale-sipoc` already produced under `.specify/specs/{NNN}-{module}/final/actions/{kebab-id}.sipoc.md`. The SIPOC Inputs table feeds `parameters()`; the SIPOC Process section feeds the `handle()` body. This skill does NOT author SIPOCs — that's [opscale-sipoc](../opscale-sipoc/SKILL.md)'s job.

In **Standalone mode** (packages) there is no SIPOC: the user supplies the same information directly.

### Opscale Action Contract

Every Action extends `Opscale\Actions\Action`. All input flows through `$this->fill($attributes)` then `$this->validate()`. Never bypass this.

| Method | Required | Purpose |
|--------|----------|---------|
| `identifier(): string` | YES | kebab-case ID — matches BPMN logic id or derived from class name |
| `name(): string` | YES | Human-readable name — plain string, no `__()` |
| `description(): string` | YES | One sentence explaining the action — plain string, no `__()`. Written for AI/MCP context |
| `parameters(): array` | YES | Typed input declarations with validation rules |
| `handle(array $attributes = []): array` | YES | Business logic — always returns array with success key |

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
public function handle(array $attributes = []): array
{
    $this->fill($attributes);
    $this->validate();

    $entity = $this->get('entity_param');
    $scalar = $this->get('scalar_param');

    // business logic

    return [
        'success' => true,
        // result data
    ];
}
```

Rules:
- Always start: `$this->fill($attributes)` then `$this->validate()`
- Access all values via `$this->get('property')` — never from `$attributes` directly
- Always return array — minimum `['success' => bool]`
- Return meaningful keys alongside success
- Soft failure (missing optional data): return `['success' => false, 'message' => '...']`
- Hard failure (invalid state): throw an exception — let it bubble
- Compose with other Actions via `OtherAction::run(['param' => $value])`
- No HTTP context, no `request()` helper — handle() is context-free
- `Auth::id()` is allowed only when the business rule explicitly requires knowing who triggered it

### Output context methods — override only when needed

An Action's output adapts to each surface (Nova, HTTP, CLI, MCP). Override these only when the default isn't enough. The methods (`asNovaAction`, `getActionFields`, `asController`, `asCommand`, `asMCPTool`) and when to use each are documented in `references/output-context-overrides.md`.

### Nova registration — explicit, per Resource

Every generated Action that exposes a Nova surface (i.e. overrides `asNovaAction()`) is automatically registered in the corresponding Resource's `actions()` method by `generate-action.mjs`. The skill never asks the LLM to manually edit a Resource to add an Action — the generator does it from the SIPOC's "Target resource(s)" line.

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
2. **SIPOC is an input, not an output** (BPMN-driven mode) — every Action depends on a SIPOC under `final/actions/{kebab-id}.sipoc.md`. This skill consumes them; `opscale-sipoc` produces them.
3. **Spec-kit plan + tasks before code** — `/speckit.plan` and `/speckit.tasks` run BEFORE any `action-generator` agent is spawned.
4. **Every implementation task has a preceding test task** — `tasks.md` lists `Test {ClassName}` immediately before `Implement {ClassName}`.
5. **Always `fill()` then `validate()`** — access all values via `$this->get('property')`, never from `$attributes` directly.
6. **Always return array with `success: bool`** — callers depend on this contract.
7. **Soft failures return, hard failures throw** — missing optional data returns `['success' => false]`; truly invalid state throws.
8. **Override context methods only when needed** — `asNovaAction()`, `asController()`, `asCommand()`, `asMCPTool()` are optional.
9. **Compose via `::run()`** — generate leaf actions before composite actions.
10. **handle() is context-free** — no `request()`, no `redirect()`, no HTTP assumptions.
11. **`identifier()` derivation** — from BPMN `logic.id` when available, otherwise kebab-case from class name.
12. **`description()` is for AI** — write it as if explaining to an AI agent what the tool does and when to invoke it.
13. **`declare(strict_types=1)`** — every PHP file.
14. **Single-quote hygiene** — every string emitted into `identifier()`, `name()`, `description()`, and parameter `name`/`description` is wrapped in single quotes by the template. Generators MUST escape apostrophes (`'` → `\'`) on every value.
15. **Actions are registered on Resources by the generator** — every generated Action with a Nova surface (`asNovaAction`) is auto-added to the corresponding Resource's `actions()` method by `generate-action.mjs`. The skill never asks the LLM to hand-edit a Resource for this.
16. **State-bounded visibility via `canSee`** — when the SIPOC declares a precondition like _"only available when entity is in state X"_, the generator wraps the action registration with a `canSee` guard. Full pattern catalogue in `references/canSee-patterns.md`.

## Steps

### Phase 1 — Inventory SIPOCs / BPMN logic tasks

**Mode Detection:** determine the mode based on project type:
- **app/module** projects → `.specify/specs/{NNN}-{module-name}/final/process.bpmn` exists → **BPMN-driven mode**
- **package** projects → no `final/process.bpmn` or spec files → **Standalone mode**

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

**2a. Build the spec-kit plan input.** Compose a brief that lists every Action to be generated, in dependency order, with its source BPMN task, lane, parameters (from BPMN + DBML), and Business Rules from `final/process.md`. Pass this as the seed for `/speckit.plan`:

```
/speckit.plan "Logic layer for {module-name}: [N] Opscale Actions derived from
final/process.bpmn. Generate one Action class per businessRuleTask. Each Action:
- extends Opscale\\Actions\\Action
- declares identifier(), name(), description(), parameters(), handle()
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
| Inputs table | `parameters[]` | each row → `{name, description, type, rules}` |
| Composes line | `dependencies[]` | other Actions imported and called via `::run()` |
| Process section (numbered list) | `handle_body` | ordered PHP corresponding to each step, plus guard clauses for Business Rules and the final return array assembled from Outputs |

The script handles all string escaping, parameter formatting, import ordering, and conflict detection. The skill never writes PHP — it just hands the generator the normalized JSON.

If the SIPOC file is missing for any Action in `tasks.md`, stop. Run `/opscale-sipoc` to author the missing SIPOC(s), then return here.

**Wait for user approval before continuing.**

### Phase 4 — Register on Resources with canSee wrappers

The generator already registers every Action with a Nova surface on the corresponding Resource's `actions()` method, applying `canSee` guards based on the SIPOC's state preconditions (see Context → Nova registration). Verify the wiring:

- Every Action with `asNovaAction()` overridden appears in exactly one Resource's `actions()` array.
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
SPEC_DIR=$(ls -d .specify/specs/*/ 2>/dev/null | head -1)
if [ -n "$SPEC_DIR" ] && [ -f "$SPEC_DIR/final/process.bpmn" ]; then
  for f in src/Services/Actions/*.php; do
    id=$(grep -oP "return '\\K[a-z][a-z0-9-]*" "$f" | head -1)
    [ -f "$SPEC_DIR/final/actions/$id.sipoc.md" ] \
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
