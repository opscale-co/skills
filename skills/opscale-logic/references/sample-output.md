# Sample output — opscale-logic

Anonymized excerpt derived from a working Opscale module
(`Unicoop/recruitment`, opscale-co/actions ^2.2). Shows the SHAPE of what
the skill produces, not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body.

---

## 1. SIPOC-complete Action (state gate, system supplier, system client)

```php
namespace Acme\Loans\Services\Actions;

use Illuminate\Support\Collection;
use Opscale\Actions\Action;
use Opscale\Actions\Concerns\EmitsEvent;
use Acme\Loans\Models\Application;
use Acme\Loans\Models\Enums\ApplicationStatus;

class ApproveApplication extends Action
{
    use EmitsEvent; // SIPOC declares an output → event('approve-application', [$outputs])

    public function identifier(): string { return 'approve-application'; }
    public function name(): string       { return __('Approve application'); }

    public function description(): string
    {
        return 'Approves a pending application and notifies the applicant.';
    }

    public function parameters(): array
    {
        return [
            [
                'name'        => 'application',
                'description' => 'The pending application to approve.',
                'type'        => Application::class,
                'rules'       => ['required'],
            ],
        ];
    }

    /**
     * SIPOC Supplier = system: en Nova llega como el registro seleccionado;
     * en API/CLI/MCP la closure resuelve null y el caller envia el id.
     */
    #[\Override]
    public function prefill(): array
    {
        return ['application' => fn ($ctx) => $ctx?->models?->first()];
    }

    #[\Override]
    public function canRun(array $inputs = []): bool|string
    {
        $application = $this->application($inputs);

        if (! $application instanceof Application) {
            return 'Application not found.';
        }

        if ($application->status !== ApplicationStatus::Pending) {
            return 'Application is not pending (BR-01).';
        }

        return true;
    }

    public function handle(array $inputs = []): array
    {
        $application = $this->application($inputs);

        if (! $application instanceof Application) {
            return $this->fail('Application not found.');
        }

        $application->status = ApplicationStatus::Approved;
        $application->save();

        return $this->succeed(['application_id' => $application->id]);
    }

    public function outputs(): array
    {
        return [
            [
                'name'        => 'application_id',
                'description' => 'The approved application.',
                'type'        => 'string',
                'rules'       => ['required', 'string'],
            ],
        ];
    }

    private function application(array $inputs): ?Application
    {
        $application = $inputs['application'] ?? null;

        // Nova extras inyectan la Collection seleccionada bajo la clave
        // snake_case del modelo; prefill entrega la instancia; API/CLI/MCP el id.
        if ($application instanceof Collection) {
            $application = $application->first();
        }

        if ($application instanceof Application) {
            return $application;
        }

        return is_string($application) ? Application::query()->find($application) : null;
    }
}
```

## 2. Action wired in the Nova Resource with `canSee` gating (status-driven)

```php
// Acme\Loans\Nova\Application::actions()
return [
    (new NovaActionDecorator(new ApproveApplication))
        ->canSee(function ($request): bool {
            if (! $request->resourceId) {
                return true; // POST de ejecución: el gate real es canRun()
            }

            return $request->findModel()->status === ApplicationStatus::Pending;
        }),
];
```

> `canSee` hides the action in invalid states (UI honesty); `canRun()` is the
> authoritative gate that every adapter enforces. Both come from the same
> SIPOC state precondition.

## 3. Feature test through the pipeline

```php
// tests/Helpers.php
function executeAction(Action $action, array $inputs, mixed $context = null): Result
{
    return (fn (): Result => $this->execute($inputs, $context))->call($action);
}

// tests/Feature/ApproveApplicationTest.php
it('approves a pending application (BR-01)', function (): void {
    Event::fake(['approve-application']);
    $application = makeApplication(['status' => 'pending']);

    $result = executeAction(new ApproveApplication, ['application' => $application]);

    expect($result->isSuccess())->toBeTrue()
        ->and($result->data()['application_id'])->toBe($application->id);
    Event::assertDispatched('approve-application');
});

it('soft-fails outside Pending (BR-01)', function (): void {
    $application = makeApplication(['status' => 'approved']);

    $result = executeAction(new ApproveApplication, ['application' => $application]);

    expect($result->isFail())->toBeTrue()
        ->and($result->message())->toBe('Application is not pending (BR-01).');
});
```

> Each Action's `identifier()` matches a BPMN `businessRuleTask`'s
> `{"type":"logic","id":"…"}` documentation tag (see opscale-bpmn).
> `canRun()` carries the SIPOC state preconditions, `handle()` the Process
> column, `outputs()` the Outputs table, and `EmitsEvent` its notifications.
