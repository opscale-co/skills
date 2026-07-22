# Sample output — opscale-logic

Anonymized excerpt derived from a working Opscale module
(`Unicoop/membresia`). Shows the SHAPE of what the skill produces,
not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body. The full original file lives in the source module.

---

## 1. Simple Action (no parameters, no canSee — fired from a different status)

```php
namespace Acme\Loans\Services\Actions;

use Acme\Loans\Models\Enums\ApplicationStatus;
use Acme\Loans\Services\Actions\Concerns\ResolvesFromContext;
use Opscale\Actions\Action;
use Opscale\NovaToolbarActions\ShowAsButton;
use RuntimeException;

class CheckKyc extends Action
{
    use ResolvesFromContext;
    use ShowAsButton;

    public function identifier(): string { return 'check-kyc'; }
    public function name(): string       { return __('Check KYC'); }

    public function description(): string
    {
        return 'Acknowledges that the applicant identity has been verified '
             . 'upstream and moves the Application from Pending to KYC Ready.';
    }

    public function parameters(): array { return []; }

    public function handle(array $attributes = []): array
    {
        $application = $this->resolveApplication($attributes);

        if ($application->status !== ApplicationStatus::Pending) {
            throw new RuntimeException('Application must be Pending to check KYC.');
        }

        $application->update(['status' => ApplicationStatus::KycReady->value]);

        return [
            'success'        => true,
            'application_id' => $application->id,
            'new_status'     => ApplicationStatus::KycReady->value,
        ];
    }
}
```

## 2. Action wired in the Nova Resource with `canSee` gating (status-driven)

```php
// Acme\Loans\Nova\Application::actions()
return [
    CheckKyc::make()
        ->withMeta(['showAsButton' => true])
        ->canSee(fn (): bool => ! $exists || $status === ApplicationStatus::Pending),

    ApproveApplication::make()
        ->withMeta(['showAsButton' => true])
        ->canSee(fn (): bool => ! $exists || $status === ApplicationStatus::Qualified),

    RejectApplication::make()
        ->withMeta(['showAsButton' => true])
        ->canSee(fn (): bool => ! $exists || in_array(
            $status,
            [
                ApplicationStatus::Evaluating,
                ApplicationStatus::SemiQualified,
                ApplicationStatus::Qualified,
            ],
            true,
        )),

    ActivateApplication::make()
        ->withMeta(['showAsButton' => true])
        ->canSee(fn (): bool => ! $exists || $status === ApplicationStatus::Approved),
];
```

> Each Action's `identifier()` matches a BPMN `businessRuleTask`'s
> `{"type":"logic","id":"…"}` documentation tag (see opscale-bpmn).
> The Action's `handle()` body follows the Process column of the
> matching SIPOC (see opscale-sipoc).
