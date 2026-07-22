# Sample output — opscale-seed

Anonymized excerpt derived from a working Opscale module
(`Unicoop/membresia`). Shows the SHAPE of what the skill produces,
not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body. The full original file lives in the source module.

---

## `workbench/database/seeders/DatabaseSeeder.php` — connected-dataset pattern

```php
namespace Workbench\Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Acme\Loans\Models\{Application, ContractTerms, Decision, Member,
    Requirement, Score, Verification};
use Acme\Loans\Models\Enums\{ApplicationStatus, ContractTermsStatus,
    DecisionOutcome, MemberStatus, PolicyStatus};

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (Policy::query()->exists()) { return; }   // idempotent guard

        DB::transaction(function (): void {
            $this->seedUsers();
            $policy = $this->seedPolicy();

            // Three connected records so a reviewer can walk each branch:
            $this->seedPendingApplication($policy);     // SP1 entry
            $member = $this->seedActiveApplication($policy);  // SP2 exit (terminal)
            $this->seedWithdrawal($member);                   // SP3+SP4 entry
        });
    }

    private function seedActiveApplication(Policy $policy): Member
    {
        // Force final state — bypasses the status-transition guard
        // because the dataset goal is "this is what an Active member
        // looks like end-to-end", not "exercise the transitions".
        $application = Application::query()->create([
            'code' => sprintf('APP-%d-99999', date('Y')),
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

        Score::create([
            'application_id' => $application->id,
            'cycle_number'   => 1,
            'score' => 90, 'rating_band' => 'High',
        ]);

        $decision = Decision::create([
            'application_id' => $application->id,
            'cycle_number' => 1,
            'outcome' => DecisionOutcome::Approve->value,
            'approval_type' => 'Standard',
        ]);

        ContractTerms::create([
            'application_id' => $application->id,
            'decision_id'    => $decision->id,
            'status'         => ContractTermsStatus::Finalized->value,
        ]);

        return Member::create([
            'application_id' => $application->id,
            'party_id'       => $application->party_id,
            'status'         => MemberStatus::Active->value,
        ]);
    }
}
```

> The dataset is **one coherent run**, not isolated rows: every chain
> link points at the previous one, so a reviewer opening any aggregate
> root in Nova can drill down without hitting an empty tab.
