# Sample output — opscale-test

Anonymized excerpt derived from a working Opscale module
(`Unicoop/membresia`). Shows the SHAPE of what the skill produces,
not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body. The full original file lives in the source module.

---

## 1. `phpunit.dusk.xml` (forces APP_LOCALE so Dusk asserts match the seeded translations)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit bootstrap="vendor/autoload.php"
         colors="true"
         processIsolation="false"
         cacheDirectory=".phpunit.cache.dusk">
    <testsuites>
        <testsuite name="Browser">
            <directory>tests/Browser</directory>
        </testsuite>
    </testsuites>
    <php>
        <env name="APP_KEY"             value="base64:…" force="true"/>
        <env name="APP_LOCALE"          value="en"        force="true"/>
        <env name="APP_FALLBACK_LOCALE" value="en"        force="true"/>
        <env name="APP_FAKER_LOCALE"    value="en_US"     force="true"/>
    </php>
</phpunit>
```

## 2. Feature test — `tests/Feature/ApproveApplicationTest.php`

```php
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Acme\Loans\Models\{Application, Policy};
use Acme\Loans\Models\Enums\{ApplicationStatus, ApprovalType};
use Acme\Loans\Services\Actions\ApproveApplication;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Auth::shouldReceive('id')->andReturn((string) Str::ulid());
});

it('approves with Standard and creates ContractTerms', function (): void {
    $policy      = Policy::factory()->active()->create();
    $application = Application::factory()->for($policy)->qualified()->create();

    $result = (new ApproveApplication)->handle([
        'application'  => collect([$application]),
        'approvalType' => ApprovalType::Standard->value,
        'reason'       => 'Standard approval reason text long enough.',
    ]);

    expect($result['success'])->toBeTrue();
    expect($application->fresh()->status)->toBe(ApplicationStatus::Approved);

    $terms = $application->fresh()->contractTerms;
    expect($terms)->not->toBeNull();
    expect((string) $terms->cycle_of_interest_payment)->toBe('P1M');
});
```

## 3. `composer.json` — test scripts

```json
"scripts": {
    "test":            "./vendor/bin/pest --testsuite=Unit,Feature",
    "test:unit":       "./vendor/bin/pest --testsuite=Unit",
    "test:feature":    "./vendor/bin/pest --testsuite=Feature",
    "test:browser":    "DUSK_HEADLESS=true DUSK_PAUSE_MS=0 ./vendor/bin/pest -c phpunit.dusk.xml --exclude-testsuite=Showcase tests/Browser/Sp1FlowTest.php tests/Browser/Sp2FlowTest.php"
}
```
