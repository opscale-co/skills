# Sample output — opscale-ui

Anonymized excerpt derived from a working Opscale module
(`Unicoop/membresia`). Shows the SHAPE of what the skill produces,
not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body. The full original file lives in the source module.

---

## `src/Nova/Application.php`

```php
namespace Acme\Loans\Nova;

use Laravel\Nova\Fields\{Badge, DateTime, HasMany, HasOne, Number, Select, Text, Textarea};
use Laravel\Nova\Http\Requests\NovaRequest;
use Laravel\Nova\Resource;
use Laravel\Nova\Tabs\Tab;
use Acme\Loans\Contracts\PartiesContract;
use Acme\Loans\Models\Application as ApplicationModel;
use Acme\Loans\Models\Enums\ApplicationStatus;

class Application extends Resource
{
    public static $model = ApplicationModel::class;

    public static $title  = 'code';
    public static $search = ['code', 'party_id'];

    /** Eager-load every relation read by the conditional tabs below. */
    public static $with = [
        'documents', 'requirements', 'verifications', 'scores',
        'decisions', 'contractTerms', 'member',
    ];

    public static function label(): string         { return __('Applications'); }
    public static function singularLabel(): string { return __('Application'); }

    /** Send the operator straight to the detail page so the Action buttons appear. */
    public static function redirectAfterCreate(NovaRequest $request, $resource): string
    {
        return '/resources/applications/'.$resource->id;
    }

    public function fields(NovaRequest $request): array
    {
        return [
            Tab::group(__('Application'), [
                Tab::make(__('Details'), [
                    Text::make(__('Code'), 'code')->exceptOnForms(),

                    // Virtual relation rendered as a Select — the options
                    // come from the cross-subdomain contract resolver, not
                    // from a local Eloquent relation.
                    Select::make(__('Counterparty'), 'party_id')
                        ->options(resolve(PartiesContract::class)->options())
                        ->displayUsingLabels()
                        ->searchable()
                        ->rules(...ApplicationModel::$validationRules['party_id']),

                    Number::make(__('Current Cycle'), 'current_cycle')->exceptOnForms(),
                    Textarea::make(__('Notes'), 'notes')->hideFromIndex(),
                    $this->statusBadge()->exceptOnForms(),
                    DateTime::make(__('Created At'), 'created_at')->exceptOnForms(),
                ]),

                Tab::make(__('Documents'),     [HasMany::make(__('Documents'),     'documents',     Document::class)]),
                Tab::make(__('Requirements'),  [HasMany::make(__('Requirements'),  'requirements',  Requirement::class)]),
                Tab::make(__('Verifications'), [HasMany::make(__('Verifications'), 'verifications', Verification::class)]),
                Tab::make(__('Score'),         [HasMany::make(__('Scores'),        'scores',        Score::class)]),
                Tab::make(__('Decision'),      [HasMany::make(__('Decisions'),     'decisions',     Decision::class)]),
                Tab::make(__('Contract Terms'),[HasOne::make(__('Contract Terms'), 'contractTerms', ContractTerms::class)->onlyOnDetail()]),
                Tab::make(__('Member'),        [HasOne::make(__('Member'),         'member',        Member::class)->onlyOnDetail()]),
            ]),
        ];
    }

    private function statusBadge(): Badge
    {
        return Badge::make(__('Status'), 'status')->map([
            ApplicationStatus::Pending->value   => 'warning',
            ApplicationStatus::Qualified->value => 'info',
            ApplicationStatus::Approved->value  => 'success',
            ApplicationStatus::Active->value    => 'success',
            ApplicationStatus::Rejected->value  => 'danger',
        ]);
    }
}
```
