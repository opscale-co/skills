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

## Purpose

Generate Opscale Action classes — atomic, typed, independently testable business
operations built on [opscale-co/actions](https://github.com/opscale-co/actions),
which extends [Laravel Actions](https://laravelactions.com).

Mode is determined by project type:

- **BPMN-driven** (app/module) — one Action per `businessRuleTask` node in
  `process.md`. Parameters derived from BPMN + DBML. Business rules from `spec.md`.
- **Standalone** (package) — Actions defined directly by name, purpose, and
  parameters. No BPMN or DBML files required.

The same Action class serves multiple execution contexts automatically:
- **Nova Action** — admin panel via `asNovaAction()` + `getActionFields()`
- **Artisan command** — terminal via `php artisan {identifier}`
- **API endpoint** — HTTP via `Route::post('/path', ActionClass::class)`
- **MCP tool** — AI agent via MCP Server registration

Output files are written to `src/Services/Actions/` and listed in
`.specify/specs/{NNN}-{module-name}/plan.md` (logic section) when specs exist.

---

## Prerequisites

### BPMN-driven mode (app/module projects)

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | `opscale-process` has been run | `spec.md` exists and PASS | Stop. Run `/opscale-process`. |
| 3 | `opscale-dbml` has been run | `data-model.md` exists and PASS | Stop. Run `/opscale-dbml`. |
| 4 | `opscale-bpmn` has been run | `process.md` exists and PASS | Stop. Run `/opscale-bpmn`. |
| 5 | `opscale-sipoc` has been run | One `docs/actions/{kebab-id}.sipoc.md` per `businessRuleTask` | Stop. Run `/opscale-sipoc`. |
| 6 | `opscale-domain` has been run | `src/Models/` populated, domain bundle tasks in `tasks.md` complete | Stop. Run `/opscale-domain`. |
| 7 | `opscale-ui` has been run | `src/Nova/` populated, Nova bundle tasks in `tasks.md` complete | Stop. Run `/opscale-ui`. |

This skill is **Step 3 (last) of the Generate phase**. Order is strict: `domain → ui → logic`. After this skill, the module is feature-complete and ready for the Review phase (`debug → test → release`).

### Standalone mode (package projects)

Prerequisite 1 (`opscale-init`) still applies. Spec files are not required — the user provides:
- Action names and purposes
- Parameter definitions (types, validation rules)
- Business logic description
- Package namespace and output directory

---

## Output: File Structure

```
src/
└── Services/
    └── Actions/
        └── {ActionClassName}.php    (one per businessRuleTask or standalone action)
```

In **BPMN-driven mode**, this skill consumes the per-Action SIPOC documents
that `opscale-sipoc` already produced under
`.specify/specs/{NNN}-{module}/docs/actions/{kebab-id}.sipoc.md`. The SIPOC
Inputs table feeds `parameters()`; the SIPOC Process section feeds the
`handle()` body. This skill does NOT author SIPOCs — that's
[opscale-sipoc](../opscale-sipoc/SKILL.md)'s job. If a SIPOC is missing, stop
and run `/opscale-sipoc` first.

In **Standalone mode** (packages) there is no SIPOC: the user supplies the
same information directly as part of the Action definition.

---

## Opscale Action Contract

Every Action extends `Opscale\Actions\Action`. All input flows through
`$this->fill($attributes)` then `$this->validate()`. Never bypass this.

| Method | Required | Purpose |
|--------|----------|---------|
| `identifier(): string` | YES | kebab-case ID — matches BPMN logic id (BPMN mode) or derived from class name (standalone) |
| `name(): string` | YES | Human-readable name — plain string, no `__()` |
| `description(): string` | YES | One sentence explaining the action — plain string, no `__()`. Written for AI/MCP context |
| `parameters(): array` | YES | Typed input declarations with validation rules |
| `handle(array $attributes = []): array` | YES | Business logic — always returns array with success key |

---

## parameters() format

Each parameter is an associative array with four keys:

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

---

## handle() contract

```php
public function handle(array $attributes = []): array
{
    $this->fill($attributes);
    $this->validate();

    $[entity] = $this->get('[entity_param]');
    $[scalar] = $this->get('[scalar_param]');

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
- Return meaningful keys alongside success (task, sequence, due_date, etc.)
- Soft failure (missing optional data): return `['success' => false, 'message' => '...']`
- Hard failure (invalid state): throw an exception — let it bubble
- Compose with other Actions via `OtherAction::run(['param' => $value])`
- No HTTP context, no `request()` helper — handle() is context-free
- `Auth::id()` is allowed only when the business rule explicitly requires knowing who triggered it

---

## Output context methods — override only when needed

The `Opscale\Actions\Action` base class provides default behavior for all four
output contexts. Only implement a context method when you need to **customize how
the result is returned** — not just because the action is used in that context.

### When to override

| Method | Override when... |
|--------|-----------------|
| `asNovaAction()` | You need to navigate, show a custom danger message, or handle ValidationException specially |
| `asController()` | You need a custom HTTP response format or status code |
| `asCommand()` | You need custom terminal output formatting |
| `asMCPTool()` | You need to shape the MCP tool response differently |

If the default behavior (return the array as-is) is sufficient, do not add the method.

### asNovaAction() — when result needs custom Nova feedback

```php
public function asNovaAction(ActionFields $fields, Collection $models): mixed
{
    try {
        $attributes = $fields->toArray();
        $attributes['[entity]'] = $models->first();

        $this->fill($attributes);
        $this->validate();

        $result = $this->handle($attributes);

        if (empty($result) || ! $result['success']) {
            return Action::danger($result['message'] ?? 'Something went wrong.');
        }

        // Navigate to the result record:
        return Action::visit("/resources/[resource-uri]/{$result['[entity]']->id}");
        // Or show a success message:
        // return Action::message($result['message']);

    } catch (ValidationException $e) {
        $errors = collect($e->errors())
            ->map(fn ($msgs, $field) => "{$field}: " . implode(', ', $msgs))
            ->implode("\n");

        return Action::danger($errors);

    } catch (\Throwable $e) {
        return Action::danger($e->getMessage());
    }
}
```

### getActionFields() — always define when action needs user input

```php
public function getActionFields(): array
{
    return [
        Text::make(__('[Label]'), '[field]')
            ->rules('required', 'string', 'max:255'),

        Textarea::make(__('[Label]'), '[field]')
            ->rules('nullable', 'string'),

        Select::make(__('[Label]'), '[field]')
            ->options([...])
            ->searchable()
            ->nullable(),
    ];
}
```

### asController() — when custom HTTP response needed

```php
public function asController(Request $request): \Illuminate\Http\JsonResponse
{
    $result = $this->handle($request->validated());

    if (! $result['success']) {
        return response()->json(['message' => $result['message']], 422);
    }

    return response()->json($result);
}
```

### asCommand() — when custom terminal output needed

```php
public function asCommand(Command $command): void
{
    $result = $this->handle([
        '[param]' => $command->argument('[param]'),
    ]);

    $command->info($result['success']
        ? $result['message']
        : 'Failed: ' . $result['message']
    );
}
```

### asMCPTool() — when custom MCP response shape needed

```php
public function asMCPTool(array $arguments): array
{
    $result = $this->handle($arguments);

    // Shape the response for the MCP client
    return [
        'status'  => $result['success'] ? 'ok' : 'error',
        'payload' => $result,
    ];
}
```

---

## Workflow

### Mode Detection

Determine the mode based on project type:
- **app/module** projects → `.specify/specs/{NNN}-{module-name}/process.md` exists → **BPMN-driven mode**
- **package** projects → no process.md or spec files → **Standalone mode**

---

### BPMN-driven Workflow

#### Phase 1 — Inventory from process.md

Extract every `businessRuleTask` and build the generation plan:

```
Logic Actions to generate:

| # | Task name | logic id | Actor lane | Business Rules |
|---|-----------|----------|------------|----------------|
| 1 | [name] | [kebab-id] | [lane] | BR-01, BR-02 |
| 2 | [name] | [kebab-id] | System | BR-03 |

Confirm before generating?
```

Wait for confirmation.

#### Phase 2 — Resolve dependency order

When an Action calls another Action (composition pattern):

```
Dependency graph:
  [LeafAction1]       — no dependencies
  [LeafAction2]       — no dependencies
  [CompositeAction]   — calls LeafAction1, LeafAction2

Generate order: LeafAction1 → LeafAction2 → CompositeAction
Confirm?
```

Wait for confirmation.

#### Phase 3 — Drive spec-kit to plan + produce per-Action tasks

Before generating any code, formalize the plan through spec-kit so that every
Action becomes a tracked task. This is what makes the implementation phase
auditable and what feeds `opscale-test` (which generates one Feature test per
task in `tasks.md`).

**3a. Build the spec-kit plan input.** Compose a brief that lists every Action
to be generated, in dependency order, with its source BPMN task, lane,
parameters (from BPMN + DBML), and Business Rules from `spec.md`. Pass this as
the seed for `/speckit.plan`:

```
/speckit.plan "Logic layer for {module-name}: [N] Opscale Actions derived from
process.md. Generate one Action class per businessRuleTask. Each Action:
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

**3b. Generate per-Action tasks with `/speckit.tasks`.** Each Action MUST land
as exactly one task in `tasks.md`. The task contract is:

| Task field | Value |
|------------|-------|
| Title | `Implement {ActionClassName}` |
| Description | First line of the Action's `description()` |
| Inputs | DBML entities + scalars from `parameters()` |
| Outputs | Return-array keys |
| Acceptance | Business Rules (BR-NN) the Action enforces |
| Depends on | Task IDs of leaf Actions this composes |
| Test task | `Test {ActionClassName}` — precedes the implementation task |

```
/speckit.tasks "Generate one implementation task per Opscale Action from plan.md.
Each Action gets exactly one task with: title 'Implement {ClassName}', acceptance
criteria mapped to Business Rules (BR-NN), and depends_on edges matching the
composition graph. Precede every implementation task with a 'Test {ClassName}'
task (opscale-test will fill it). Do not merge two Actions into one task."
```

Verify `tasks.md`:

```
[ ] One task per Action — count matches the inventory
[ ] Each task title starts with 'Implement '
[ ] Each task has a matching 'Test ' task preceding it
[ ] Dependency edges match the composition graph from Phase 2
[ ] Every Action's Business Rules appear in its task's acceptance criteria
```

If any check fails, regenerate tasks.md before continuing — do NOT generate
code from an incomplete task list.

#### Phase 4 — Generate Actions

For each task in `tasks.md` (dependency order), normalize the matching SIPOC
(produced by `opscale-sipoc`) into the JSON contract documented at the top of
`scripts/generate-action.mjs`, then spawn `action-generator` (a thin wrapper)
in parallel within each dependency level (leaves first, composites next).

**SIPOC → JSON contract mapping:**

| SIPOC section | JSON field | Notes |
|---------------|-----------|-------|
| `Identifier:` | `identifier` | kebab-case; matches BPMN `logic.id` |
| `# SIPOC — {Name}` heading | `name`, `action_class_name` | name is human text; class is PascalCase |
| First paragraph after heading | `description` | one sentence, for AI/MCP context |
| Inputs table | `parameters[]` | each row → `{name, description, type, rules}` |
| Composes line | `dependencies[]` | other Actions imported and called via `::run()` |
| Process section (numbered list) | `handle_body` | ordered PHP corresponding to each step, plus guard clauses for Business Rules and the final return array assembled from Outputs |

The script handles all string escaping, parameter formatting, import ordering,
and conflict detection. The skill never writes PHP — it just hands the
generator the normalized JSON.

If the SIPOC file is missing for any Action in `tasks.md`, stop. Run
`/opscale-sipoc` to author the missing SIPOC(s), then return here.

#### Phase 5 — Update plan.md

Append to `.specify/specs/{NNN}-{module-name}/plan.md`:

```markdown
## Logic Layer

| File | Class | BPMN task | Task ID | Rules |
|------|-------|-----------|---------|-------|
| src/Services/Actions/[Class].php | [Class] | [task] | T-NN | BR-01 |
```

The `Task ID` column ties each generated file back to its `tasks.md` entry so
`opscale-test` and `/speckit.implement` can verify completeness.

---

### Standalone Workflow

For standalone packages with no BPMN/SIPOC source, follow the standalone
variant in `references/standalone-mode.md`. Mode Detection above tells you when
to use it; everything after this section (Code Template, Smoke gate) applies to
both modes.

## Code Template

The authoritative template is `templates/action.php.tmpl` and the renderer is
`scripts/generate-action.mjs`. The skill normalizes each Action into the JSON
contract documented at the top of that script, then spawns
`action-generator` (a thin wrapper that just runs the script) in parallel —
one instance per Action.

The skill is responsible for assembling `handle_body` as ready-to-run PHP
(including any `OtherAction::run([...])` composition calls). The script
indents and inserts it verbatim — it does not transform business logic.

---

## Smoke gate (MANDATORY before marking the skill complete)

Action templates fail at parse time when apostrophes leak into PHP string
literals, and at runtime when `identifier()` / `parameters()` return
non-string values. Always run these checks:

```bash
# 0. (BPMN-driven mode) Every generated Action has a matching SIPOC
SPEC_DIR=$(ls -d .specify/specs/*/ 2>/dev/null | head -1)
if [ -n "$SPEC_DIR" ] && [ -f "$SPEC_DIR/process.md" ]; then
  for f in src/Services/Actions/*.php; do
    id=$(grep -oP "return '\\K[a-z][a-z0-9-]*" "$f" | head -1)
    [ -f "$SPEC_DIR/docs/actions/$id.sipoc.md" ] \
      || { echo "❌ Missing SIPOC for $id"; exit 1; }
  done
  echo "OK every Action has a SIPOC under docs/actions/"
fi

# 1. Every Action file parses
find src/Services/Actions -name '*.php' -print0 \
  | xargs -0 -n1 php -l > /dev/null \
  || { echo "❌ php -l failed"; exit 1; }

# 2. Every Action instantiates and honors the Opscale Action contract
composer dump-autoload --no-scripts > /dev/null
php -r 'require "vendor/autoload.php";
  $bad = [];
  foreach (glob("src/Services/Actions/*.php") as $f) {
    $class = "[PackageNamespace]\\\\Services\\\\Actions\\\\" . basename($f, ".php");
    try {
      $a = new $class();
      if (! is_string($a->identifier()) || ! preg_match("/^[a-z][a-z0-9-]*$/", $a->identifier()))
        throw new RuntimeException("identifier() not kebab-case");
      if (! is_string($a->name()) || ! is_string($a->description()))
        throw new RuntimeException("name() / description() must return string");
      if (! is_array($a->parameters()))
        throw new RuntimeException("parameters() must return array");
      foreach ($a->parameters() as $p) {
        if (! isset($p["name"], $p["description"], $p["type"], $p["rules"]))
          throw new RuntimeException("parameter missing keys");
      }
    } catch (Throwable $e) { $bad[$class] = $e->getMessage(); }
  }
  if ($bad) { foreach ($bad as $c => $m) fwrite(STDERR, "$c: $m\n"); exit(1); }
  echo "OK ".count(glob("src/Services/Actions/*.php"))." Actions loaded\n";'
```

Do NOT mark the gate `PASS` based on file count — Actions with apostrophes
in their description compile clean until the moment Laravel autoloads them.

---

## Domain Rules

1. **One BPMN task = one Action class = one spec-kit task** — never merge two BPMN tasks or two standalone requests into one class, and never let a single Action span more than one entry in `tasks.md`. The chain is 1:1:1 across BPMN → code → tasks.md.
2. **SIPOC is an input, not an output** (BPMN-driven mode) — every Action depends on a SIPOC under `docs/actions/{kebab-id}.sipoc.md`. This skill consumes them; `opscale-sipoc` produces them. If a SIPOC is missing, stop and run `/opscale-sipoc` first.
3. **Spec-kit plan + tasks before code** — `/speckit.plan` and `/speckit.tasks` run BEFORE any `action-generator` agent is spawned. Code generation reads from `tasks.md`; if a planned Action has no task entry, do not generate it — fix the task list first.
3. **Every implementation task has a preceding test task** — `tasks.md` lists `Test {ClassName}` immediately before `Implement {ClassName}`. `opscale-test` fills the test task body later; this skill just ensures the slot exists.
4. **Always `fill()` then `validate()`** — access all values via `$this->get('property')`, never from `$attributes` directly.
5. **Always return array with `success: bool`** — callers depend on this contract.
6. **Soft failures return, hard failures throw** — missing optional data returns `['success' => false]`; truly invalid state throws.
7. **Override context methods only when needed** — `asNovaAction()`, `asController()`, `asCommand()`, `asMCPTool()` are optional. Add only when the default return behavior must be customized.
8. **Compose via `::run()`** — generate leaf actions before composite actions.
9. **handle() is context-free** — no `request()`, no `redirect()`, no HTTP assumptions.
10. **`identifier()` derivation** — from BPMN `logic.id` when available, otherwise kebab-case from class name.
11. **`description()` is for AI** — write it as if explaining to an AI agent what the tool does and when to invoke it.
12. **`declare(strict_types=1)`** — every PHP file.
13. **Single-quote hygiene** — every string emitted into `identifier()`, `name()`, `description()`, and parameter `name`/`description` is wrapped in single quotes by the template. Generators MUST escape apostrophes (`'` → `\'`) on every value. Strings like `"Operating day's business date"` parse-fail otherwise. Alternative: emit with double quotes and escape `$` + `\`. One convention, applied everywhere.
