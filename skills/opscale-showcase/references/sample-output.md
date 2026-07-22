# Sample output — opscale-showcase

Anonymized excerpt derived from a working Opscale module
(`Unicoop/membresia`). Shows the SHAPE of what the skill produces,
not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body. The full original file lives in the source module.

---

## `tests/Browser/LoansShowcaseTest.php`

```php
namespace Acme\Loans\Tests\Browser;

use Laravel\Dusk\Browser;
use Acme\Loans\Models\{Application, WithdrawalRequest};
use Acme\Loans\Tests\DuskTestCase;
use PHPUnit\Framework\Attributes\Test;
use Workbench\App\Catalogs\PartyCatalog;

/**
 * Single guided walkthrough of the full Loans module — SP1 → SP2 → SP3 →
 * SP4 in one Nova session. Designed to run NON-headless with a 3 s pause
 * before each form submit so a stakeholder can follow along:
 *
 *   DUSK_HEADLESS=false DUSK_PAUSE_MS=3000 \
 *       ./vendor/bin/pest tests/Browser/LoansShowcaseTest.php -c phpunit.dusk.xml
 *
 * The test resets the relevant seeded rows on top so the demo is
 * re-runnable against the shared workbench DB.
 */
final class LoansShowcaseTest extends DuskTestCase
{
    #[Test]
    public function guided_walkthrough_of_full_loans_module(): void
    {
        $this->resetSeededPendingApplication();
        $this->resetSeededWithdrawalRequest();

        $application = Application::query()
            ->where('party_id', PartyCatalog::ids()[0])
            ->firstOrFail();
        $withdrawal  = WithdrawalRequest::query()->firstOrFail();

        $this->browse(function (Browser $browser) use ($application, $withdrawal): void {
            $this->loginToNova($browser);

            // ─── SP1 — Admission: Preparation ──────────────────────────
            $browser->visit('/nova/resources/applications')
                    ->waitForText('Applications', 15, ignoreCase: true)
                    ->pause((int) env('DUSK_PAUSE_MS', 0));        // ← stakeholder beat

            $browser->visit('/nova/resources/applications/'.$application->id)
                    ->waitFor('[data-action-id="check-kyc"]', 15);

            $this->runActionWithoutFields($browser, 'check-kyc');
            $this->waitForStatus($browser, 'KYC Ready');

            $this->runActionWithoutFields($browser, 'check-aml');
            $this->waitForStatus($browser, 'AML Ready');

            $this->runEvaluateApplicationPickingHighestOptions($browser);
            $this->waitForStatus($browser, 'Evaluating');

            $this->runActionWithoutFields($browser, 'score-application');
            $this->waitForStatus($browser, 'Qualified');

            // ─── SP2 — Admission: Review ───────────────────────────────
            $this->runApproveStandard($browser);
            $this->waitForStatus($browser, 'Approved');

            $this->runActivateApplication($browser);
            $this->waitForStatus($browser, 'Active');

            // ─── SP3 + SP4 — Withdrawal flows continue here … ──────────
        });
    }

    private function runActionWithoutFields(Browser $browser, string $id): void
    {
        $browser->click("[data-action-id=\"{$id}\"]")
                ->waitFor('[dusk="confirm-action-button"]', 15)
                ->pause((int) env('DUSK_PAUSE_MS', 0))   // ← 3 s before each main action
                ->click('[dusk="confirm-action-button"]');
    }
}
```
