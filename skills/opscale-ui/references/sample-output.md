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

    public static $title  = 'code';           // descriptive column — never 'id'
    public static $search = ['code'];         // never 'id'

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

    /** Curated, N+1-free subset — scalar columns + status badge only. */
    public function fieldsForIndex(NovaRequest $request): array
    {
        return [
            Text::make(__('Code'), 'code')->sortable(),
            Number::make(__('Current Cycle'), 'current_cycle')->sortable(),
            $this->statusBadge()->sortable(),
            DateTime::make(__('Created At'), 'created_at')
                ->displayUsing(fn ($v) => $v?->diffForHumans())
                ->sortable(),
        ];
    }

    /** Full set — all business fields inline + status + timestamps, in tabs. */
    public function fields(NovaRequest $request): array
    {
        return [
            Tab::group(__('Application'), [
                Tab::make(__('Details'), [
                    Text::make(__('Code'), 'code')->exceptOnForms(),

                    // Virtual relation rendered as a Select — the options
                    // come from the cross-subdomain contract resolver, not
                    // from a local Eloquent relation. (Excluded from the index:
                    // it resolves per row → N+1.)
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

    /**
     * Actions registered by opscale-ui (Phase 5) — every Action from
     * src/Services/Actions/ that targets this entity, wrapped in the canSee
     * guard matching its SIPOC precondition.
     */
    public function actions(NovaRequest $request): array
    {
        return [
            QualifyApplication::make()
                ->canSee(fn ($request) => $request->findModel()?->status?->is(ApplicationStatus::Pending)),

            ApproveApplication::make()
                ->canSee(fn ($request) => in_array(
                    $request->findModel()?->status,
                    [ApplicationStatus::Qualified, ApplicationStatus::PendingReview],
                    strict: true,
                )),

            // No state/role precondition → registered without canSee.
            ExportApplication::make(),
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

## One Resource per entity — the child has its own Resource too

`Document`, `Requirement`, `Score`, … are no longer inline-only: each is a
navigable Resource (`src/Nova/Document.php`, etc.) with its own relation tabs
and a `redirectAfterCreate()` back to its parent Application. The Application
Resource above still shows them as tabs — the difference is those tabs now link
to real, openable child Resources instead of dead-end inline lists.

```php
// src/Nova/Document.php — a child entity that now has its own Resource
class Document extends Resource
{
    public static $model = DocumentModel::class;

    public static function redirectAfterCreate(NovaRequest $request, $resource): string
    {
        return "/resources/applications/{$resource->application_id}";
    }

    public function fields(NovaRequest $request): array
    {
        return [
            Tab::group(__('Document'), [
                Tab::make(__('Details'), [ /* own fields */ ]),
                // this child's OWN relations render as tabs too
                Tab::make(__('Verifications'), [
                    HasMany::make(__('Verifications'), 'verifications', Verification::class),
                ]),
            ]),
        ];
    }
}
```

## Browser flow test — one per subprocess of `process.json`

Generated by the `web-test-generator` agent, one file per subprocess. Each method
**executes** the subprocess (create via form → run each Action from the detail
toolbar) and asserts **both** the visible transition and the persisted DB state.
See `references/flow-test-gotchas.md` for the drivability rules.

```php
// tests/Browser/ApplicationApprovalFlowTest.php
final class ApplicationApprovalFlowTest extends DuskTestCase
{
    #[Test]
    final public function happy_path_completes_end_to_end(): void
    {
        $code = 'APP-'.now()->timestamp;

        $this->browse(function (Browser $browser) use ($code): void {
            $this->loginToNova($browser)
                // 1. Create via the real form (native Selects only).
                ->visit('/nova/resources/applications/new')
                ->waitForText('Create Application')
                ->type('@code', $code)
                ->select('@status', 'Pending')
                ->submitForm('@create-button')
                ->assertNoErrorToast()
                ->waitForText('The Application was created!');

            // 2. Run the Action from the DETAIL toolbar (fake ref id is a valid ULID).
            $this->runAction($browser, 'approve-application', [
                ['select', 'reviewer_id', '01HZY0ABCDEFGHJKMNPQRSTVWX'],
            ]);

            // 3. Transition is visible.
            $browser->refresh()->waitForAnywhere('Approved');
        });

        // 4. Transition persisted (shared workbench SQLite).
        $application = Application::query()->where('code', $code)->firstOrFail();
        expect($application->fresh()->status)->toBe(ApplicationStatus::Approved);
    }
}
```
