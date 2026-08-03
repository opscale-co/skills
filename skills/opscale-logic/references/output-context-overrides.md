# Adapter surfaces — the pipeline handles them; do not override

Since opscale-co/actions ^2.2 the base `Opscale\Actions\Action` runs the full
SIPOC pipeline on every adapter (Nova, HTTP, CLI, MCP): prefill resolution,
input validation, `canRun()` gate, `handle()`, output validation and the
`EmitsEvent` dispatch. Each adapter already translates the `Result` envelope
to its native channel:

| Adapter | Success | Soft fail (`fail()` / `canRun()`) | Hard fail (Throwable) |
|---------|---------|-----------------------------------|----------------------|
| Nova (`asNovaAction`) | `Action::message(...)` | `Action::danger(reason)` | `Action::danger(message)` |
| HTTP (`asController`) | JSON `{success: true, data}` | 422 `{success: false, message, data}` | exception bubbles |
| CLI (`asCommand`) | info output | error output | exception bubbles |
| MCP (`asMCPTool`) | tool response + `outputSchema` | MCP error response | MCP error |

**Never override `asNovaAction()` / `asController()` / `asCommand()` /
`asMCPTool()`.** The two customization needs that used to justify overrides
are now first-class hooks:

1. **"The entity comes from the Nova selection"** → a `prefill()` closure:

```php
#[\Override]
public function prefill(): array
{
    return ['entity' => fn ($ctx) => $ctx?->models?->first()];
}
```

The closure receives the adapter context (Nova: object with `->fields` and
`->models`; HTTP: the `Request`; CLI: the `Command`; MCP: the MCP `Request`).
Returning null drops the entry so the caller-supplied value survives — the
same Action works on every surface.

2. **"Render a nicer form"** → the Nova adapter infers fields from
`parameters()` rules and `options()` (see SKILL.md → Nova field inference).
`getActionFields()` should not be overridden either; adjust rules/options
instead.

The only remaining legitimate override is a truly custom response shape
(e.g. `Action::visit(...)` navigation after success). Treat it as an
exception that must be justified in the PR, not a pattern.
