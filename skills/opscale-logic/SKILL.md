---
name: opscale-logic
description: >
  Generates complete Opscale Action classes. Determines mode by project type:
  (1) BPMN-driven (app/module) — one Action per businessRuleTask from process.md.
  Step 6 in the Opscale sequence — runs AFTER opscale-ui and BEFORE opscale-outputs.
  (2) Standalone (package) — Actions defined directly without BPMN/DBML.
  In both modes, spawns action-generator agents for parallel generation.
  Trigger when the user says "generate the actions", "implement the business logic",
  "create the Opscale Actions", or "build the logic layer".
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

## Input Requirements

### BPMN-driven mode (app/module projects)

Before starting, verify:
- `.specify/specs/{NNN}-{module-name}/process.md` exists and passed completeness gate
- `.specify/specs/{NNN}-{module-name}/spec.md` exists (for Business Rules context)
- `.specify/specs/{NNN}-{module-name}/data-model.md` exists (for parameter types)

### Standalone mode (package projects)

No spec files are required. The user provides:
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

#### Phase 3 — Generate Actions

For each task in dependency order:

- **Class name**: PascalCase from task name (`AssignTask`, `CalculatePriority`)
- **`identifier()`**: BPMN `logic.id` value (`assign-task`, `calculate-priority`)
- **`parameters()`**: derived from BPMN task inputs + DBML entity types
- **`handle()` body**: implement Business Rules from `spec.md`

#### Phase 4 — Update plan.md

Append to `.specify/specs/{NNN}-{module-name}/plan.md`:

```markdown
## Logic Layer

| File | Class | BPMN task | Rules |
|------|-------|-----------|-------|
| src/Services/Actions/[Class].php | [Class] | [task] | BR-01 |
```

---

### Standalone Workflow

#### Phase 1 — Collect Action definitions

From the user request, build the generation plan:

```
Logic Actions to generate:

| # | Action name | identifier | Purpose |
|---|-------------|------------|---------|
| 1 | [name] | [kebab-id] | [one-line description] |
| 2 | [name] | [kebab-id] | [one-line description] |

Confirm before generating?
```

Wait for confirmation.

#### Phase 2 — Resolve dependency order

Same as BPMN-driven — if an Action composes others, generate leaves first.

#### Phase 3 — Generate Actions

For each action in dependency order:

- **Class name**: PascalCase from action name
- **`identifier()`**: kebab-case from class name (e.g. `CalculateInterest` → `calculate-interest`)
- **`parameters()`**: from provided parameter definitions
- **`handle()` body**: implement the described logic

#### Phase 4 — Update plan.md (if specs exist)

If `.specify/specs/` directory exists, append to plan.md. Otherwise skip.

---

## Code Template

```php
<?php

declare(strict_types=1);

namespace [PackageNamespace]\Services\Actions;

use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use Laravel\Nova\Fields\ActionFields;
use Laravel\Nova\Fields\Select;
use Laravel\Nova\Fields\Text;
use Laravel\Nova\Fields\Textarea;
use Opscale\Actions\Action;
use [PackageNamespace]\Models\[ModelName];
use [PackageNamespace]\Models\Enums\[StatusEnum];

class [ActionClassName] extends Action
{
    public function identifier(): string
    {
        return '[kebab-case-id]';
    }

    public function name(): string
    {
        return '[Human Readable Name]';
    }

    public function description(): string
    {
        return '[One sentence for AI/MCP: what this action does and when to use it]';
    }

    public function parameters(): array
    {
        return [
            [
                'name'        => '[entity_param]',
                'description' => '[What this entity represents in context]',
                'type'        => [ModelName]::class,
                'rules'       => ['required'],
            ],
            [
                'name'        => '[scalar_param]',
                'description' => '[What this value represents]',
                'type'        => 'string',
                'rules'       => ['required', 'string', 'max:255'],
            ],
        ];
    }

    public function handle(array $attributes = []): array
    {
        $this->fill($attributes);
        $this->validate();

        /** @var [ModelName] $[entity] */
        $[entity] = $this->get('[entity_param]');
        $[scalar] = $this->get('[scalar_param]');

        // --- Business Rules (BR-01, BR-02) ---

        // Compose with dependency actions if needed:
        // $result = [DependencyAction]::run(['param' => $value]);
        // if (! $result['success']) {
        //     return ['success' => false, 'message' => $result['message']];
        // }

        $[entity]->save();

        return [
            'success' => true,
            '[entity]' => $[entity],
            'message'  => __('[Action] completed successfully.'),
        ];
    }

    // Override output context methods only when default behavior is insufficient

    public function asNovaAction(ActionFields $fields, Collection $models): mixed
    {
        try {
            $attributes = $fields->toArray();
            $attributes['[entity_param]'] = $models->first();

            $this->fill($attributes);
            $this->validate();

            $result = $this->handle($validatedData);

            if (empty($result) || ! $result['success']) {
                return Action::danger($result['message'] ?? __('Something went wrong.'));
            }

            return Action::message($result['message']);

        } catch (ValidationException $e) {
            $errors = collect($e->errors())
                ->map(fn ($msgs, $field) => "{$field}: " . implode(', ', $msgs))
                ->implode("\n");

            return Action::danger($errors);

        } catch (\Throwable $e) {
            return Action::danger($e->getMessage());
        }
    }

    public function getActionFields(): array
    {
        return [
            Text::make(__('[Label]'), '[field]')
                ->rules('required', 'string', 'max:255'),
        ];
    }
}
```

---

## Domain Rules

1. **One task = one Action** — never merge two BPMN tasks or two standalone requests into one class.
2. **Always `fill()` then `validate()`** — access all values via `$this->get('property')`, never from `$attributes` directly.
3. **Always return array with `success: bool`** — callers depend on this contract.
4. **Soft failures return, hard failures throw** — missing optional data returns `['success' => false]`; truly invalid state throws.
5. **Override context methods only when needed** — `asNovaAction()`, `asController()`, `asCommand()`, `asMCPTool()` are optional. Add only when the default return behavior must be customized.
6. **Compose via `::run()`** — generate leaf actions before composite actions.
7. **handle() is context-free** — no `request()`, no `redirect()`, no HTTP assumptions.
8. **`identifier()` derivation** — from BPMN `logic.id` when available, otherwise kebab-case from class name.
9. **`description()` is for AI** — write it as if explaining to an AI agent what the tool does and when to invoke it.
10. **`declare(strict_types=1)`** — every PHP file.
