# Test Harness — Config Files & Nova/Dusk Reference

Verbatim config files and reference tables for the test harness `opscale-init`
configures (Phase 4f). Read the relevant block when the body points you here.

## Table of contents

- [phpunit.xml (Unit + Feature)](#phpunitxml-unit--feature)
- [phpunit.dusk.xml (Browser — separate config)](#phpunitduskxml-browser--separate-config)
- [tests/TestCase.php (Unit + Feature)](#teststestcasephp-unit--feature)
- [tests/Pest.php](#testspestphp) — incl. full testbench.yaml, DuskTestCase, Browser example, Nova selectors, seeders, phpstan.neon, duster.json, pint.json
- [tests/Helpers.php](#testshelpersphp) — executeAction() + bindFakeContracts(), autoloaded via composer autoload-dev
- [composer.json — scripts block](#composerjson--scripts-block-the-replicable-test-commands) — build/serve/test/test:browser/check + package.json mirror
- [Troubleshooting](#troubleshooting) — Dusk 500s, port conflicts, ChromeDriver mismatch, session persistence

---

## phpunit.xml (Unit + Feature)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:noNamespaceSchemaLocation="https://schema.phpunit.de/10.5/phpunit.xsd"
    bootstrap="vendor/autoload.php"
    colors="true"
>
    <testsuites>
        <testsuite name="Unit">
            <directory suffix="Test.php">./tests/Unit</directory>
        </testsuite>
        <testsuite name="Feature">
            <directory suffix="Test.php">./tests/Feature</directory>
        </testsuite>
        <testsuite name="Browser">
            <directory suffix="Test.php">./tests/Browser</directory>
        </testsuite>
    </testsuites>
    <source>
        <include>
            <directory suffix=".php">./src</directory>
        </include>
    </source>
    <php>
        <env name="APP_ENV" value="testing"/>
        <env name="APP_KEY" value="base64:YOUR_KEY_HERE"/>
        <env name="BCRYPT_ROUNDS" value="4"/>
        <env name="CACHE_DRIVER" value="array"/>
        <env name="DB_CONNECTION" value="testbench"/>
        <env name="DB_DATABASE" value=":memory:"/>
        <env name="QUEUE_CONNECTION" value="sync"/>
        <env name="SESSION_DRIVER" value="array"/>
    </php>
</phpunit>
```

## phpunit.dusk.xml (Browser — separate config)

Browser tests use a **separate** PHPUnit config because the Dusk server runs as a separate
PHP process with its own database and session handling. Do NOT set `SESSION_DRIVER`,
`CACHE_DRIVER`, or `DB_*` here — the Dusk server inherits its config from `testbench.yaml`
and the workbench `.env`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="vendor/autoload.php"
         colors="true"
         processIsolation="false"
         stopOnFailure="false"
         cacheDirectory=".phpunit.cache.dusk">
    <testsuites>
        <testsuite name="Browser">
            <directory>tests/Browser</directory>
        </testsuite>
    </testsuites>
    <php>
        <env name="APP_KEY" value="base64:YOUR_KEY_HERE" force="true"/>
        <env name="APP_LOCALE" value="{locale}" force="true"/>
        <env name="APP_FALLBACK_LOCALE" value="{locale}" force="true"/>
        <env name="APP_FAKER_LOCALE" value="{faker_locale}" force="true"/>
    </php>
</phpunit>
```

**CRITICAL — what goes here and what must not.** Set exactly `APP_KEY` plus the three
locale vars, all with `force="true"` so the separate Dusk PHP process matches the
showcase / production locale (without `force`, the workbench `.env` wins and Browser
assertions on localized labels fail). Do NOT set `SESSION_DRIVER`, `CACHE_DRIVER`, or
`DB_*` here — the Dusk server runs as a real process and needs the real sessions/DB it
inherits from `testbench.yaml`; overriding those breaks it. The
`processIsolation`/`stopOnFailure`/`cacheDirectory` attributes are required — they keep
the Browser suite in one process with its own cache dir, separate from `phpunit.xml`.

---

## tests/TestCase.php (Unit + Feature)

```php
<?php

namespace [PackageNamespace]\Tests;

use Orchestra\Testbench\TestCase as BaseTestCase;
use Override;

abstract class TestCase extends BaseTestCase
{
    #[Override]
    protected function getPackageProviders($app): array
    {
        return array_merge(parent::getPackageProviders($app), [
            \Orion\OrionServiceProvider::class,              // if using Orion
            \[PackageNamespace]\ToolServiceProvider::class,
            \Laravel\Sanctum\SanctumServiceProvider::class,  // if using Sanctum
            \Laravel\Nova\NovaServiceProvider::class,
            \Laravel\Nova\NovaCoreServiceProvider::class,
        ]);
    }

    #[Override]
    protected function defineEnvironment($app): void
    {
        parent::defineEnvironment($app);
        $app['config']->set('database.default', 'testbench');
        $app['config']->set('database.connections.testbench', [
            'driver' => 'sqlite',
            'database' => ':memory:',
            'prefix' => '',
        ]);
    }

    #[Override]
    protected function defineDatabaseMigrations(): void
    {
        parent::defineDatabaseMigrations();
        $this->loadLaravelMigrations();
        $this->loadMigrationsFrom(__DIR__ . '/../vendor/laravel/sanctum/database/migrations');
        $this->loadMigrationsFrom(__DIR__ . '/../workbench/database/migrations');
    }
}
```

## tests/Pest.php

```php
<?php

use [PackageNamespace]\Tests\TestCase;

uses(TestCase::class)->in('Unit', 'Feature');
```

**NOTE**: Browser tests are NOT bootstrapped in Pest.php — they use `DuskTestCase` directly
via class inheritance and run with a separate phpunit config (`phpunit.dusk.xml`).

## tests/Helpers.php

Shared test helpers for the Unit + Feature suites. Autoloaded via the composer
`autoload-dev` `files` entry (below) so every test — and Pest's own bootstrap —
sees these functions. `executeAction()` is the four-case entry point for Feature
tests; `bindFakeContracts()` is populated per module by `opscale-domain` (it knows
which cross-subdomain contracts it generated).

```php
<?php

declare(strict_types=1);

use Illuminate\Database\Eloquent\Builder;
use Workbench\App\Models\User;

/**
 * Run an Opscale Action against the real test DB and return its envelope.
 * The single entry point Feature tests use for all four cases (positive /
 * negative / false-positive / false-negative) — never call handle() directly.
 *
 * @param  class-string  $action
 * @param  array<string, mixed>  $params
 * @return array<string, mixed>
 */
function executeAction(string $action, array $params = []): array
{
    return $action::run($params);
}

/**
 * Bind anonymous fake implementations of the module's cross-subdomain contracts
 * so Unit tests can resolve belongsToContract() relations without the host app.
 * Each fake's query() targets the workbench User (the stand-in aggregate).
 *
 * opscale-domain fills the body with one binding per generated contract, e.g.:
 *
 *   app()->bind(\[PackageNamespace]\Contracts\AgencyContract::class, fn () =>
 *       new class implements \[PackageNamespace]\Contracts\AgencyContract {
 *           public function query(): Builder { return User::query(); }
 *       });
 *
 * If the module has NO cross-subdomain contracts, keep this a documented no-op.
 */
function bindFakeContracts(): void
{
    // Generated per module by opscale-domain — see references/cross-subdomain-contracts.md.
}
```

Register it in `composer.json` (owned by `opscale-init` / `opscale-domain`):

```json
"autoload-dev": {
    "psr-4": {
        "[PackageNamespace]\\Tests\\": "tests/",
        "Workbench\\": "workbench/"
    },
    "files": [
        "tests/Helpers.php"
    ]
}
```

---

---

### testbench.yaml (full file — copy verbatim, then adjust the marked lines)

The Dusk server boots from `testbench.yaml`. This is the whole file, not just the provider
list: the `env:` block forces the locale, the `providers:` list supplies everything Nova
auto-discovers (and Testbench does not), and the `workbench:` block is the exact build
sequence `composer run build` replays so any contributor or CI recreates an identical,
seeded Nova workbench. Copy it verbatim; change only the lines marked `# adjust`.

```yaml
laravel: '@testbench-dusk'

env:
  - APP_LOCALE={locale}
  - APP_FALLBACK_LOCALE={locale}
  - APP_FAKER_LOCALE={faker_locale}
  - APP_KEY=base64:YOUR_KEY_HERE          # adjust — must equal phpunit.xml / phpunit.dusk.xml

providers:
  - Inertia\ServiceProvider                 # REQUIRED — Nova uses Inertia, @inertia blade directive
  - Laravel\Fortify\FortifyServiceProvider  # REQUIRED — Nova auth uses Fortify (StatefulGuard binding)
  - Laravel\Dusk\DuskServiceProvider        # REQUIRED — provides _dusk/login route for loginAs()
  - Laravel\Nova\NovaCoreServiceProvider
  - Laravel\Nova\NovaServiceProvider
  - Lorisleiva\Actions\ActionServiceProvider          # REQUIRED — Opscale Actions run on Laravel Actions
  - Opscale\Actions\ToolServiceProvider
  - Opscale\NovaToolbarActions\ToolServiceProvider
  - Laravel\Sanctum\SanctumServiceProvider  # if using Sanctum
  - Orion\OrionServiceProvider              # if using Orion
  - Workbench\App\Providers\WorkbenchServiceProvider
  - Workbench\App\Providers\NovaServiceProvider
  - Acme\YourModule\SubdomainServiceProvider          # adjust — your module's service provider

migrations:
  - workbench/database/migrations

seeders:
  - Workbench\Database\Seeders\DatabaseSeeder

workbench:
  start: /nova
  build:
    - package:discover
    - asset-publish
    - create-sqlite-db
    - db:wipe
    - migrate:refresh
    - 'db:seed --class="Workbench\Database\Seeders\DatabaseSeeder"'
  assets:
    - nova-assets
  sync: []

purge:
  directories:
    - lang/*
    - public/vendor/*
```

**Missing providers cause 500 errors in the Dusk server that are INVISIBLE** — no log output,
no error details, just a "500 SERVER ERROR" page in the browser screenshot. If you see 500s:
1. Use the debug script technique (see Troubleshooting below) to get the real exception
2. The fix is almost always a missing provider in `testbench.yaml`

**The `workbench: build:` order is load-bearing.** `create-sqlite-db` → `db:wipe` →
`migrate:refresh` → `db:seed` must stay in that sequence — it produces the seeded SQLite
DB the Browser tests assert against. Skipping or reordering yields empty Nova pages and
false Browser failures. `composer run build` runs exactly this list, so the same workbench
is reproducible on every machine.

---

### tests/DuskTestCase.php

```php
<?php

declare(strict_types=1);

namespace [PackageNamespace]\Tests;

use Facebook\WebDriver\Chrome\ChromeOptions;
use Facebook\WebDriver\Remote\DesiredCapabilities;
use Facebook\WebDriver\Remote\RemoteWebDriver;
use Illuminate\Support\Env;
use Illuminate\Support\Facades\Request;
use Illuminate\Support\Sleep;
use Laravel\Dusk\Browser;
use Orchestra\Testbench\Concerns\WithWorkbench;
use Orchestra\Testbench\Dusk\TestCase as BaseTestCase;
use Override;

abstract class DuskTestCase extends BaseTestCase
{
    use WithWorkbench;

    // Change port if default 8001 conflicts (e.g., Docker)
    protected static $baseServePort = 8089;

    /**
     * Two modes — keyed off DUSK_HEADLESS:
     *   true  (default, CI)            → headless Chrome, DUSK_PAUSE_MS defaults to 0
     *   false (local / stakeholder)    → visible Chrome, DUSK_PAUSE_MS defaults to 3000
     *                                     (3-second pause before every form / Action submit,
     *                                      matching opscale-showcase rhythm)
     *
     * DUSK_PAUSE_MS is independently overridable:
     *   DUSK_HEADLESS=false DUSK_PAUSE_MS=500 composer run test:browser:visual
     */
    #[Override]
    protected function driver(): RemoteWebDriver
    {
        $args = [
            '--window-size=1920,1080',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage',
        ];

        if ($this->isHeadless()) {
            $args[] = '--headless=new';
            $args[] = '--disable-search-engine-choice-screen';
        }

        $options = (new ChromeOptions())->addArguments($args);

        $url = $this->readEnv('DUSK_DRIVER_URL') ?? 'http://localhost:9515';

        // ChromeDriver is started asynchronously — poll its /status endpoint for
        // up to 10s before opening a session so the very first test does not race
        // the driver's port binding (a common source of one-off Browser failures).
        $this->waitForChromeDriver($url);

        return RemoteWebDriver::create(
            $url,
            DesiredCapabilities::chrome()->setCapability(ChromeOptions::CAPABILITY, $options)
        );
    }

    /** Whether the current run is headless (CI default). */
    protected function isHeadless(): bool
    {
        $raw = $this->readEnv('DUSK_HEADLESS');

        return ($raw === null || $raw === '')
            ? true
            : filter_var($raw, FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * Pause budget (ms) used by Browser::submitForm() before every submit.
     * Headless → 0 (CI is fast). Visual → 3000 (stakeholder rhythm).
     * Override with DUSK_PAUSE_MS=<int>.
     */
    public function pauseMs(): int
    {
        $explicit = $this->readEnv('DUSK_PAUSE_MS');
        if ($explicit !== null && $explicit !== '') {
            return (int) $explicit;
        }

        return $this->isHeadless() ? 0 : 3000;
    }

    /**
     * Register Browser macros once. Generators call $browser->submitForm()
     * for every submit and $browser->assertNoErrorToast() right after every
     * submit. Pause behavior is centralized here.
     */
    #[Override]
    protected function setUp(): void
    {
        parent::setUp();

        $testCase = $this;

        Browser::macro('submitForm', function (string $selector = '@create-button') use ($testCase) {
            /** @var Browser $this */
            return $this->pause($testCase->pauseMs())->click($selector);
        });

        Browser::macro('assertNoErrorToast', function () {
            /** @var Browser $this */
            return $this->pause(300)  // toasts surface ~100ms after the response
                ->assertMissing('.toasted.toasted-error')
                ->assertMissing('[role="alert"].error')
                ->assertMissing('.notification--error');
        });

        // Wait for text ANYWHERE on the page (badge, table cell, header, toast).
        // Used after ->refresh() to assert a status transition surfaced by the UI,
        // regardless of which component renders it: ->refresh()->waitForAnywhere('Approved').
        Browser::macro('waitForAnywhere', function (string $text, ?int $seconds = null) {
            /** @var Browser $this */
            return $this->waitForTextIn('body', $text, $seconds);
        });
    }

    /**
     * Open a detail-toolbar Action modal and wait for its confirm button.
     *
     * Actions are driven from the DETAIL toolbar via `[data-action-id="{id}"]`,
     * NOT the index toolbar: standalone actions on the index are not Dusk-drivable
     * because NovaActionDecorator does not propagate `$standalone` to the DOM.
     * Register every driven Action on the detail toolbar.
     */
    final protected function openAction(Browser $browser, string $actionId): Browser
    {
        return $browser
            ->waitFor('[data-action-id="'.$actionId.'"]')
            ->click('[data-action-id="'.$actionId.'"]')
            ->waitFor('@confirm-action-button');
    }

    /**
     * Open an Action, fill its modal, confirm, and assert no error toast.
     *
     * $fields is an ordered list of [kind, dusk, value] triples so field order is
     * preserved and both native Selects and Text inputs are supported:
     *   $this->runAction($browser, 'approve-application', [
     *       ['select', 'committee_id', $committeeUlid],
     *       ['type', 'decided_on', '01-15-2026'],   // dates in mdY
     *   ]);
     *
     * Modal fields are addressed as `form [dusk="{column}"]` (scoped to the modal
     * form). Only native Nova Selects and Text inputs are drivable this way —
     * ->searchable() / BelongsTo render custom components that select() cannot set.
     */
    final protected function runAction(Browser $browser, string $actionId, array $fields = []): Browser
    {
        $this->openAction($browser, $actionId);

        foreach ($fields as [$kind, $dusk, $value]) {
            $selector = 'form [dusk="'.$dusk.'"]';
            $kind === 'select'
                ? $browser->select($selector, $value)
                : $browser->type($selector, $value);
        }

        return $browser
            ->submitForm('@confirm-action-button')
            ->assertNoErrorToast();
    }

    /**
     * Login to Nova via browser using a seeded admin user.
     *
     * IMPORTANT: Do NOT use loginAs() — it requires _dusk/login route which
     * needs DuskServiceProvider AND the user must exist in the SERVER's database
     * (not the test process's in-memory DB). Browser login is more reliable.
     *
     * The method detects if already logged in (Dusk reuses browser sessions
     * between tests in the same class) and skips login if so.
     */
    final protected function loginToNova(Browser $browser): Browser
    {
        $browser->visit('/nova');

        if ($browser->element('input[name="email"]')) {
            $browser->type('email', 'admin@laravel.com')  // seeded user
                ->type('password', 'password')
                ->press('Log In')                          // Nova button text is "Log In" (with space)
                ->waitForText('Get Started');               // Nova dashboard heading
        }

        return $browser;
    }

    #[Override]
    protected function defineEnvironment($app): void
    {
        parent::defineEnvironment($app);

        $app['config']->set('app.key', 'base64:YOUR_KEY_HERE');

        // Configure package-specific settings the server needs
        $app['config']->set('nova-api.resources', [
            // List Nova resources to expose
        ]);
    }

    /**
     * Read an env var reliably. getenv() FIRST, because the test:browser /
     * test:browser:visual composer scripts set DUSK_HEADLESS / DUSK_PAUSE_MS as
     * shell-prefix vars, and Laravel's Env::get() / $_ENV may miss them — the
     * dotenv repository caches the first-resolved value, which on a Testbench
     * bootstrap is empty. getenv() always sees the shell prefix.
     */
    private function readEnv(string $key): ?string
    {
        $value = getenv($key);
        if ($value !== false) {
            return $value;
        }

        $serverValue = Request::server($key);
        if (is_string($serverValue)) {
            return $serverValue;
        }

        $envValue = Env::get($key);

        return is_string($envValue) ? $envValue : null;
    }

    /** Poll ChromeDriver's /status until it reports ready (default 10s). */
    private function waitForChromeDriver(string $url, int $timeoutMs = 10000): void
    {
        $deadline = microtime(true) + ($timeoutMs / 1000);
        $statusUrl = rtrim($url, '/').'/status';

        while (microtime(true) < $deadline) {
            $ch = curl_init($statusUrl);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT_MS => 500,
                CURLOPT_TIMEOUT_MS => 1000,
            ]);
            $body = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($code === 200 && is_string($body) && str_contains($body, '"ready"')) {
                return;
            }

            Sleep::usleep(150_000);
        }
    }
}
```

### Browser Test Example — Full Flow

Browser tests **execute the subprocess end to end** — log in, create the trigger
record through the real Nova form, run each Action of the subprocess from the
detail toolbar, then assert both the **user-visible transition** and the
**persisted DB post-condition**. One file per subprocess in `docs/plan/process.txt`;
one test method per flow path (happy path + each gateway branch + each failure
path that is observable in the UI).

**A flow test must exercise the subprocess, not visualize it.** `visit` +
`waitForText` + `assertSee('<a button>')` proves nothing ran. Drive the create
form, drive each Action, and assert the effect.

**Layer split — what belongs where:**
- **Browser test** drives the real UI and asserts the **user-visible transition**
  (`->refresh()->waitForAnywhere('<new state>')`) **and** the resulting **DB
  post-condition** (`->fresh()->status`, row counts). Both matter: the UI proves
  the operator can do it, the DB proves it actually happened.
- **Feature test** asserts the Action's **business contract** in isolation —
  events dispatched, envelope, the four cases (positive / negative /
  false-positive / false-negative). It does not drive the browser.

**DB assertions read the shared workbench SQLite.** They work because the Dusk
server and the test process both open the *file* SQLite built by the
`testbench.yaml` `workbench:` sequence — that is why `phpunit.dusk.xml` must NOT
set `DB_DATABASE` (an `:memory:` override would give the test process a private,
empty DB and every `->fresh()` would return null).

**Submit + toast convention** — every form / Action submit MUST go through
`$browser->submitForm()` (centralizes the headless-vs-visual pause) and MUST be
immediately followed by `$browser->assertNoErrorToast()`; the `runAction()` helper
does both for you. Do NOT add raw `->pause()` calls; the pause is keyed off
`DUSK_HEADLESS` / `DUSK_PAUSE_MS`.

**Create-form field gotchas (confirmed):**
- Only native Nova `Select` and Text inputs are Dusk-drivable. `->searchable()`
  and `BelongsTo` render custom components that `select()` cannot set, and two
  `BelongsTo` to the same resource share a `dusk` id (ambiguous). Use a `Select`
  per column on the create form for anything a flow test must set.
- Fake external-reference IDs typed into the form must be **valid ULIDs**
  (Crockford base32 — no `i`, `l`, `o`, `u`) or the field's `ulid` rule rejects them.

```php
<?php

declare(strict_types=1);

namespace [PackageNamespace]\Tests\Browser;

use Laravel\Dusk\Browser;
use [PackageNamespace]\Models\[ModelName];
use [PackageNamespace]\Tests\DuskTestCase;
use PHPUnit\Framework\Attributes\Test;

/**
 * One file per subprocess in docs/plan/process.txt.
 * Inside: one test method per path (happy + branches + visible failures).
 * Each method CREATES via the form, RUNS the subprocess Actions, and asserts
 * the transition (UI) + the post-condition (DB).
 */
final class [FlowName]FlowTest extends DuskTestCase
{
    #[Test]
    final public function happy_path_completes_end_to_end(): void
    {
        $code = 'APP-'.now()->timestamp;   // unique per run

        $this->browse(function (Browser $browser) use ($code): void {
            $this->loginToNova($browser)
                // 1. Create the trigger record via the real Nova form.
                //    Use Selects per column — searchable()/BelongsTo are not drivable.
                //    External-ref ids must be valid ULIDs.
                ->visit('/nova/resources/[uri-key]/new')
                ->waitForText('Create [Singular Label]')
                ->type('@[code_field]', $code)
                ->select('@[status_field]', '[Initial State]')
                ->submitForm('@create-button')
                ->assertNoErrorToast()
                ->waitForText('The [Singular Label] was created!');

            // 2. Run each Action of the subprocess from the detail toolbar.
            //    runAction() opens [data-action-id], fills the modal, confirms,
            //    and asserts no error toast.
            $this->runAction($browser, '[action-identifier]', [
                ['type', '[action_field]', '[action_value]'],  // dates in mdY: 01-15-2026
            ]);

            // 3. Assert the transition is visible AND persisted.
            $browser->refresh()->waitForAnywhere('[New State]');
        });

        // DB post-condition — reads the shared workbench SQLite the server wrote.
        $record = [ModelName]::query()->where('[code_field]', $code)->firstOrFail();
        expect($record->fresh()->status)->toBe([StatusEnum]::[NewState]);
    }

    // One additional test method per gateway branch, e.g.:
    //   #[Test] final public function path_when_credit_score_too_low_takes_rejection_branch(): void { ... }
    //   #[Test] final public function path_when_amount_above_limit_shows_validation(): void { ... }
}
```

### Nova Dusk Selectors Reference

Nova components expose these Dusk selectors:

| Field Type | Selector | Usage |
|-----------|----------|-------|
| Text | `@[attribute]` | `->type('@name', 'value')` |
| Select | `@[attribute]` | `->select('@status', 'active')` |
| MorphTo type | `@[attribute]-type` | `->select('@tokenable-type', 'users')` |
| MorphTo search | `@[attribute]-search-input` | `->type('@tokenable-search-input', 'Admin')` |
| MorphTo select | `@[attribute]-select` | `->select('@tokenable-select', '1')` |
| Boolean | `@[attribute]` | `->check('@active')` |

### Nova submit / Action / toast selectors

| Element | Selector | Usage |
|---------|----------|-------|
| Submit button (Create form) | `@create-button` | `->submitForm('@create-button')` |
| Submit button (Update form) | `@update-button` | `->submitForm('@update-button')` |
| Delete modal trigger | `@open-delete-modal-button` | `->click('@open-delete-modal-button')` |
| Action button (detail toolbar) | `[data-action-id="{action-identifier}"]` | `->click('[data-action-id="approve-loan"]')` — drive Actions from the DETAIL toolbar (see gotcha) |
| Action modal field | `form [dusk="{column}"]` | `->select('form [dusk="committee_id"]', $ulid)` / `->type('form [dusk="decided_on"]', '01-15-2026')` |
| Action modal confirm | `@confirm-action-button` | `->submitForm('@confirm-action-button')` |
| Error toast (Nova 4/5) | `.toasted.toasted-error` | (asserted by `assertNoErrorToast()`) |
| Error toast (Nova 3 legacy) | `[role="alert"].error` | (asserted by `assertNoErrorToast()`) |
| Error toast (fallback) | `.notification--error` | (asserted by `assertNoErrorToast()`) |
| Success toast (Nova 4/5) | `.toasted.toasted-success` | `->waitFor('.toasted.toasted-success')` |

**Action toolbar gotcha (confirmed).** Drive Actions from the **detail** toolbar
(`[data-action-id="{id}"]`), not the index toolbar. Standalone actions on the index
are not Dusk-drivable — `NovaActionDecorator` does not propagate `$standalone` to the
DOM, so the button never carries a usable selector. Register every Action a flow test
must run on the detail toolbar. The `openAction()` / `runAction()` helpers on
`DuskTestCase` encapsulate this.

### Nova UI Text Reference

| Element | Text |
|---------|------|
| Login button | `Log In` (with space, NOT "Login") |
| Dashboard heading | `Get Started` |
| Create button text | `Create [Singular Label]` |
| Update button text | `Update [Singular Label]` |
| Delete confirm button | `Delete` |
| Resource-created success toast | `The [Singular Label] was created!` |
| Resource-updated success toast | `The [Singular Label] was updated!` |
| Action-success toast | `The action ran successfully!` |

### Environment variables — Browser modes

| Variable | Default | Effect |
|----------|---------|--------|
| `DUSK_HEADLESS` | `true` | `true` → headless Chrome; `false` → visible Chrome window. |
| `DUSK_PAUSE_MS` | derived | `0` when headless, `3000` when visible. Override with any integer (ms). Used by `Browser::submitForm()` as the pause before every submit. |

CI uses the defaults (`DUSK_HEADLESS=true`, `DUSK_PAUSE_MS=0`). Local visual runs use `composer run test:browser:visual` which sets `DUSK_HEADLESS=false DUSK_PAUSE_MS=3000`.

---

---

---

### workbench/database/seeders/DatabaseSeeder.php

```php
<?php

declare(strict_types=1);

namespace Workbench\Database\Seeders;

use Illuminate\Database\Seeder;
use [PackageNamespace]\Models\[ModelName];

final class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Admin user — used by loginToNova()
        \Workbench\Database\Seeders\UserSeeder::run();

        // One record per aggregate root — minimum for Browser flow tests to resolve a real detail/list page
        [ModelName]::factory()->count(3)->create();
        // ... one factory call per aggregate
    }
}
```

**Rules:**
- Seed 1–3 records per aggregate root — enough to render a detail page
- Always seed an `admin@laravel.com / password` user (matches `loginToNova()` helper)
- Use factories, never raw inserts — factories are part of the domain
- Do NOT seed business-correctness data here — that belongs in Feature test setup

---

---

### phpstan.neon

```neon
includes:
    - vendor/larastan/larastan/extension.neon
    - vendor/opscale-co/strict-rules/rules.clean.neon
    - vendor/opscale-co/strict-rules/rules.ddd.neon
    - vendor/opscale-co/strict-rules/rules.smells.neon
    - vendor/opscale-co/strict-rules/rules.solid.neon

parameters:
    level: 9
    phpVersion: 80200
    paths:
        - src
        - tests
        - workbench/app
    excludePaths:
        - tests/fixtures/*
    ignoreErrors:
        # Service providers follow Laravel patterns that conflict with strict SOLID rules
        -
            message: '#.*#'
            path: '*ServiceProvider.php'

        # Tests require direct instantiation and helpers — strict DIP/helper rules don't apply
        -
            identifier: solid.dip.disallowInstantiation
            path: tests/*
        -
            identifier: smells.helpersRestriction.helper
            path: tests/*

        # Nova resources use __() for translations — standard Nova pattern
        -
            identifier: smells.helpersRestriction.helper
            paths:
                - src/Nova/*

        # Controllers catch exceptions at HTTP boundary for JSON error responses
        # (document the specific controller if needed)
        -
            identifier: smells.enforceLogicHandling
            path: src/Http/Controllers/*
        -
            identifier: smells.enforceLogicHandling.import
            path: src/Http/Controllers/*
        -
            identifier: smells.noDummyCatches
            path: src/Http/Controllers/*
```

**IMPORTANT**: Always run with `--memory-limit=512M` — the default 128M is insufficient
with four strict-rules sets:

```bash
./vendor/bin/phpstan analyse --memory-limit=512M
```

---

---

### duster.json

```json
{
    "include": [
        "src",
        "tests",
        "workbench/app"
    ],
    "exclude": [
        "tests/fixtures"
    ],
    "scripts": {
        "lint": {
            "phpstan": false
        },
        "fix": {
            "phpstan": false
        }
    },
    "processTimeout": 120
}
```

### pint.json

```json
{
    "preset": "laravel",
    "rules": {
        "declare_strict_types": true,
        "ordered_imports": {
            "sort_algorithm": "alpha"
        },
        "no_unused_imports": true,
        "single_quote": true
    }
}
```

**TLint rule**: Always use `use` imports instead of `\Fully\Qualified\Class` in test files.
TLint warns on backslash-prefixed namespaces and causes lint failure.

---

## composer.json — scripts block (the replicable test commands)

This is the canonical `scripts` block, taken verbatim from the reference module. It is what
makes the suite reproducible: every contributor and CI runs the same `build` (which replays
the `testbench.yaml` `workbench:` sequence and syncs ChromeDriver), the same locale-forced
Browser run, and the same `check` gate. Copy it verbatim. The only per-module substitution
is the Browser test filenames on the `test:browser`, `test:browser:visual`, and `showcase`
lines — they list this module's flow / showcase tests (`opscale-process` defines the flows,
`opscale-showcase` defines the showcase test); a new module lists its own, in the same shape.

```json
"scripts": {
    "post-autoload-dump": [
        "@clear",
        "@prepare"
    ],
    "clear": "@php vendor/bin/testbench package:purge-skeleton --ansi",
    "prepare": "@php vendor/bin/testbench package:discover --ansi",
    "build": [
        "@php vendor/bin/testbench-dusk workbench:build --ansi",
        "@php vendor/bin/testbench-dusk dusk:chrome-driver --detect"
    ],
    "serve": [
        "Composer\\Config::disableProcessTimeout",
        "@php vendor/bin/testbench-dusk serve --ansi"
    ],
    "lint": "./vendor/bin/duster lint --dirty",
    "fix": "./vendor/bin/duster fix --dirty",
    "refactor": "./vendor/bin/rector process",
    "analyse": "./vendor/bin/phpstan analyse --memory-limit=512M",
    "test": "./vendor/bin/pest --testsuite=Unit,Feature",
    "test:unit": "./vendor/bin/pest --testsuite=Unit",
    "test:feature": "./vendor/bin/pest --testsuite=Feature",
    "test:browser": "DUSK_HEADLESS=true DUSK_PAUSE_MS=0 ./vendor/bin/pest -c phpunit.dusk.xml --exclude-testsuite=Showcase tests/Browser/AdmissionPreparationFlowTest.php tests/Browser/CommitteeDecisionFlowTest.php tests/Browser/WithdrawalPreparationFlowTest.php tests/Browser/WithdrawalReviewFlowTest.php",
    "test:browser:visual": "DUSK_HEADLESS=false DUSK_PAUSE_MS=3000 ./vendor/bin/pest -c phpunit.dusk.xml tests/Browser/AdmissionPreparationFlowTest.php tests/Browser/CommitteeDecisionFlowTest.php tests/Browser/WithdrawalPreparationFlowTest.php tests/Browser/WithdrawalReviewFlowTest.php",
    "showcase": [
        "@composer build",
        "DUSK_HEADLESS=false DUSK_PAUSE_MS=3000 ./vendor/bin/pest tests/Browser/MembershipShowcaseTest.php -c phpunit.dusk.xml"
    ],
    "check": [
        "Composer\\Config::disableProcessTimeout",
        "@fix",
        "@refactor",
        "@lint",
        "@analyse",
        "@test"
    ]
}
```

Why each load-bearing piece matters for replicability:
- `post-autoload-dump` → `clear` + `prepare` rebuild the Testbench skeleton on every
  `composer install`, so a fresh clone boots the same workbench.
- `build` is two steps: `workbench:build` (replays the `testbench.yaml` `workbench:` block)
  then `dusk:chrome-driver --detect` (matches ChromeDriver to the local Chrome). Browser
  runs depend on both.
- `test:browser` forces `DUSK_HEADLESS=true DUSK_PAUSE_MS=0` (CI), `:visual` forces
  `false`/`3000` (watch a flow). The `-c phpunit.dusk.xml` flag selects the Dusk config
  above; `--exclude-testsuite=Showcase` keeps the long showcase out of the CI run.
- `check` is the single green-gate: fix → refactor → lint → analyse → test, in that order.

### composer.json — test-stack dependencies + config (verbatim from the reference)

The scripts above only run if these packages are installed. This is the exact `require-dev`
block plus the `config` and `repositories` the stack needs (`repositories` is required —
`laravel/nova` and `laravel/nova-devtool` resolve from the private Nova registry). Copy
verbatim; bump versions deliberately. The runtime `require`, `autoload`, and provider
registration in the same `composer.json` are owned by `opscale-init` / `opscale-domain` —
do not duplicate them here.

```json
"require-dev": {
    "barryvdh/laravel-debugbar": "^4.3",
    "larastan/larastan": "^3.0",
    "laravel-lang/common": "^6.8",
    "laravel/boost": "^2.4",
    "laravel/nova-devtool": "^1.9",
    "laravel/telescope": "^5.20",
    "mockery/mockery": "^1.6",
    "opscale-co/strict-rules": "^1.3",
    "orchestra/testbench": "^9.0 || ^10.0",
    "orchestra/testbench-dusk": "^9.0 || ^10.0",
    "pestphp/pest": "^3.0",
    "pestphp/pest-plugin-laravel": "^3.0",
    "rector/rector": "^2.0",
    "rector/rector-laravel": "^2.5",
    "tightenco/duster": "^3.0"
},
"config": {
    "sort-packages": true,
    "allow-plugins": {
        "pestphp/pest-plugin": true
    }
},
"repositories": [
    {
        "type": "composer",
        "url": "https://nova.laravel.com"
    }
],
"minimum-stability": "dev",
"prefer-stable": true
```

Each package maps to a script: `pestphp/pest` + `pest-plugin-laravel` → `test*`;
`orchestra/testbench-dusk` → `build` / `serve` / `test:browser`; `tightenco/duster` →
`lint` / `fix`; `rector/rector` (+ `rector-laravel`) → `refactor`; `larastan/larastan` +
`opscale-co/strict-rules` → `analyse`; `laravel/telescope` + `barryvdh/laravel-debugbar` +
`laravel/nova-devtool` → the debug tooling (Phase 4e); `mockery/mockery` → Unit/Feature
doubles. `allow-plugins.pestphp/pest-plugin` is mandatory — without it Composer blocks Pest.

### package.json — npm mirror (optional, for contributors who run npm)

Mirrors the composer scripts one-to-one so `npm run test:browser` works the same:

```json
"scripts": {
    "prepare": "husky",
    "build": "composer run build",
    "serve": "composer run serve",
    "lint": "composer run lint",
    "fix": "composer run fix",
    "refactor": "composer run refactor",
    "analyse": "composer run analyse",
    "test": "composer run test",
    "test:unit": "composer run test:unit",
    "test:feature": "composer run test:feature",
    "test:browser": "composer run test:browser",
    "test:browser:visual": "composer run test:browser:visual",
    "showcase": "composer run showcase",
    "check": "composer run check"
}
```

---

---

## Troubleshooting

### Dusk server returns 500 with no log output

The Dusk server creates a fresh app per request via `createServingApplicationForDuskServer()`.
Errors happen inside the server process and often don't reach Laravel's log.

**Debug technique** — create a temporary PHP script to reproduce the server app and capture
the real exception:

```php
<?php
require 'vendor/autoload.php';
use Orchestra\Testbench\Dusk\DuskServer;

$server = new DuskServer('127.0.0.1', 8089);
$server->setLaravel(\Orchestra\Testbench\Dusk\default_skeleton_path(), 'http://127.0.0.1:8089');
$server->stash(['class' => 'YourPackage\Tests\Browser\YourTest']);

$test = new YourPackage\Tests\Browser\YourTest('laravel');
$app = $test->createServingApplicationForDuskServer($server);

$kernel = $app->make(\Illuminate\Contracts\Http\Kernel::class);
$request = \Illuminate\Http\Request::create('/nova/login');
$response = $kernel->handle($request);

echo "Status: " . $response->getStatusCode() . "\n";
if ($response->exception) {
    echo "Exception: " . $response->exception->getMessage() . "\n";
}
```

### Common 500 causes (in order of likelihood)

| Error | Cause | Fix |
|-------|-------|-----|
| `Target class [orion] does not exist` | Orion provider missing | Add `Orion\OrionServiceProvider` to testbench.yaml |
| `StatefulGuard is not instantiable` | Fortify provider missing | Add `Laravel\Fortify\FortifyServiceProvider` to testbench.yaml |
| `Method Request::inertia does not exist` | Inertia provider missing | Add `Inertia\ServiceProvider` to testbench.yaml |
| `MissingAppKeyException` | No APP_KEY in server context | Set `app.key` in DuskTestCase `defineEnvironment()` |
| `Mix manifest not found` | Nova assets not in dusk skeleton | Copy assets from testbench-core to testbench-dusk skeleton |
| `@inertia` shows as literal text | Stale Blade view cache | Clear `storage/framework/views/*` in both skeletons |

### Port 8001 already in use

Default Dusk server port (8001) may conflict with Docker or other services:

```php
// In DuskTestCase.php
protected static $baseServePort = 8089;
```

### ChromeDriver version mismatch

```
session not created: This version of ChromeDriver only supports Chrome version 147
Current browser version is 146
```

Fix: `./vendor/bin/testbench dusk:chrome-driver 146`

### Browser session persists between tests

Dusk reuses the browser instance between tests in the same class. The `loginToNova()` helper
should detect if already logged in:

```php
$browser->visit('/nova');
if ($browser->element('input[name="email"]')) {
    // Not logged in, perform login
}
```

---
