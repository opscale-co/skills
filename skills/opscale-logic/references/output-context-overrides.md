# Output context methods — override only when needed

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
