# Sample output — opscale-showcase

Anonymized excerpts derived from a working Opscale module
(`Unicoop/membresia`). They show the SHAPE of the three Presentation
artifacts, not the full output. For the canonical specification see this
skill's `SKILL.md`, `references/seeder.md`, and `references/menu.md`. The
full original files live in the source module.

---

## 1. Seed — `workbench/database/seeders/DatabaseSeeder.php`

Connected-dataset pattern: one coherent run, not isolated rows. Every chain
link points at the previous one, so a reviewer opening any aggregate root in
Nova can drill down without hitting an empty tab.

```php
namespace Workbench\Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Acme\Loans\Models\{Application, ContractTerms, Decision, Member,
    Score, Verification, Policy};
use Acme\Loans\Models\Enums\{ApplicationStatus, ContractTermsStatus,
    DecisionOutcome, MemberStatus};
use Workbench\App\Models\User;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // >>> opscale-seed:start
        if (User::query()->count() === 0) {
            User::factory()->create(['name' => 'Admin User', 'email' => 'admin@laravel.com']);
            User::factory()->count(3)->create();
        }

        DB::transaction(function (): void {
            $policy = $this->seedPolicy();
            $this->seedPendingApplication($policy);              // SP1 entry
            $member = $this->seedActiveApplication($policy);     // SP2 exit (terminal)
            $this->seedWithdrawal($member);                      // SP3 + SP4 entry
        });
        // <<< opscale-seed:end
    }

    private function seedActiveApplication(Policy $policy): Member
    {
        // Force final state — the dataset goal is "this is what an Active
        // member looks like end-to-end", not "exercise the transitions".
        $application = Application::query()->create([
            'code'      => sprintf('APP-%d-99999', date('Y')),
            'policy_id' => $policy->id,
            'party_id'  => PartyCatalog::ids()[1],
            'status'    => ApplicationStatus::Active->value,
        ]);

        // The full chain — Verifications → Score → Decision → ContractTerms → Member.
        foreach ($policy->rules()->with('options')->get() as $rule) {
            Verification::create([
                'application_id' => $application->id,
                'rule_id'        => $rule->id,
                'rule_option_id' => $rule->options->first()->id,
                'cycle_number'   => 1,
            ]);
        }

        Score::create(['application_id' => $application->id, 'cycle_number' => 1,
            'score' => 90, 'rating_band' => 'High']);

        $decision = Decision::create(['application_id' => $application->id,
            'cycle_number' => 1, 'outcome' => DecisionOutcome::Approve->value,
            'approval_type' => 'Standard']);

        ContractTerms::create(['application_id' => $application->id,
            'decision_id' => $decision->id, 'status' => ContractTermsStatus::Finalized->value]);

        return Member::create(['application_id' => $application->id,
            'party_id' => $application->party_id, 'status' => MemberStatus::Active->value]);
    }
}
```

---

## 2. Menu — `workbench/app/Providers/NovaServiceProvider.php` `boot()` block

Process-driven sidebar — only aggregate roots are exposed. Children (Rule,
RuleOption, Verification, Decision, …) are reachable through HasMany tabs on
their aggregate root's detail page.

```php
use Illuminate\Http\Request;
use Laravel\Nova\Dashboards\Main;
use Laravel\Nova\Menu\MenuItem;
use Laravel\Nova\Menu\MenuSection;
use Laravel\Nova\Nova;
use Acme\Loans\Nova\{Application, Member, WithdrawalRequest, Policy};

public function boot(): void
{
    parent::boot();
    $this->bootRoutes();

    // >>> opscale-menu:start
    Nova::mainMenu(static fn (Request $request): array => [
        MenuSection::dashboard(Main::class)->icon('chart-bar'),

        // Admission cycle: PENDING → ACTIVE.
        MenuSection::make(__('Admission'), [
            MenuItem::resource(Application::class),
        ])->icon('clipboard-list')->collapsable(),

        // Flow outcome: the active Member.
        MenuSection::make(__('Members'), [
            MenuItem::resource(Member::class),
        ])->icon('user-group')->collapsable(),

        // Flow exit: Member withdrawals.
        MenuSection::make(__('Withdrawals'), [
            MenuItem::resource(WithdrawalRequest::class),
        ])->icon('user-remove')->collapsable(),

        // Per-institution configuration: Policy → Rules → Options.
        MenuSection::make(__('Catalog'), [
            MenuItem::resource(Policy::class),
        ])->icon('view-list')->collapsable(),
    ]);
    // <<< opscale-menu:end
}
```

| Default Nova behavior         | What opscale-showcase emits                               |
|-------------------------------|-----------------------------------------------------------|
| Alphabetical, flat list       | One section per process / role view in the module         |
| Every Resource gets an entry  | Only aggregate roots — children open via the parent's tabs |
| English Resource class names  | `__('Section')` strings, auto-translated per locale       |

---

## 3. Walkthrough — `tests/Browser/LoansShowcaseTest.php`

Single guided walkthrough of the full module — SP1 → SP2 → SP3 → SP4 in one
Nova session, NON-headless, with a 3 s pause before each main action so a
stakeholder can follow along.

```php
namespace Acme\Loans\Tests\Browser;

use Laravel\Dusk\Browser;
use Acme\Loans\Models\{Application, WithdrawalRequest};
use Acme\Loans\Tests\DuskTestCase;
use PHPUnit\Framework\Attributes\Test;
use Workbench\App\Catalogs\PartyCatalog;

final class LoansShowcaseTest extends DuskTestCase
{
    private const MAIN_BUTTON_PAUSE_MS = 3000;

    #[Test]
    public function guided_walkthrough_of_full_loans_module(): void
    {
        $application = Application::query()
            ->where('party_id', PartyCatalog::ids()[0])->firstOrFail();
        $withdrawal  = WithdrawalRequest::query()->firstOrFail();

        $this->browse(function (Browser $browser) use ($application, $withdrawal): void {
            $this->loginToNova($browser);

            // ─── SP1 — Admission: Preparation ──────────────────────────
            $browser->visit('/nova/resources/applications')
                    ->waitForText('Applications', 15, ignoreCase: true)
                    ->pause(self::MAIN_BUTTON_PAUSE_MS);        // ← stakeholder beat

            $browser->visit('/nova/resources/applications/'.$application->id)
                    ->waitFor('[data-action-id="check-kyc"]', 15);

            $this->runActionWithoutFields($browser, 'check-kyc');
            $this->waitForStatus($browser, 'KYC Ready');

            $this->runActionWithoutFields($browser, 'score-application');
            $this->waitForStatus($browser, 'Qualified');

            // ─── SP2 — Admission: Review ───────────────────────────────
            $this->runApproveStandard($browser);
            $this->waitForStatus($browser, 'Approved');

            // ─── SP3 + SP4 — Withdrawal flows continue here … ──────────
        });
    }

    private function runActionWithoutFields(Browser $browser, string $id): void
    {
        $browser->click("[data-action-id=\"{$id}\"]")
                ->waitFor('[dusk="confirm-action-button"]', 15)
                ->pause(self::MAIN_BUTTON_PAUSE_MS)   // ← 3 s before each main action
                ->click('[dusk="confirm-action-button"]');
    }
}
```
