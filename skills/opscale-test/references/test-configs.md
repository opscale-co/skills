# opscale-test — Config Files & Nova/Dusk Reference

Verbatim config files and reference tables extracted from the skill body.
Read the relevant block when the body points you here.

Contents: Troubleshooting · phpunit.xml (Unit + Feature) · testbench.yaml — Required Providers · tests/DuskTestCase.php · workbench/database/seeders/DatabaseSeeder.php · phpstan.neon · duster.json

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
<phpunit
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
    bootstrap="vendor/autoload.php"
    colors="true"
>
    <testsuites>
        <testsuite name="Browser">
            <directory>tests/Browser</directory>
        </testsuite>
    </testsuites>
    <php>
        <env name="APP_KEY" value="base64:YOUR_KEY_HERE"/>
    </php>
</phpunit>
```

**CRITICAL**: Only `APP_KEY` goes here. Any other env overrides (session, cache, DB) will
break the Dusk server because it runs as a separate process and needs real sessions/DB.

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

---

---

### testbench.yaml — Required Providers

The Dusk server loads providers from `testbench.yaml`. All providers needed for Nova to
function must be listed here, including providers that Nova normally auto-discovers:

```yaml
providers:
  - Inertia\ServiceProvider            # REQUIRED — Nova uses Inertia, @inertia blade directive
  - Laravel\Nova\NovaCoreServiceProvider
  - Laravel\Nova\NovaServiceProvider
  - Laravel\Fortify\FortifyServiceProvider  # REQUIRED — Nova auth uses Fortify (StatefulGuard binding)
  - Laravel\Dusk\DuskServiceProvider        # REQUIRED — provides _dusk/login route for loginAs()
  - Laravel\Sanctum\SanctumServiceProvider  # if using Sanctum
  - Orion\OrionServiceProvider              # if using Orion
  - Workbench\App\Providers\WorkbenchServiceProvider
  - Workbench\App\Providers\NovaServiceProvider
  - [PackageNamespace]\ToolServiceProvider
```

**Missing providers cause 500 errors in the Dusk server that are INVISIBLE** — no log output,
no error details, just a "500 SERVER ERROR" page in the browser screenshot. If you see 500s:
1. Use the debug script technique (see Troubleshooting below) to get the real exception
2. The fix is almost always a missing provider in `testbench.yaml`

---

### tests/DuskTestCase.php

```php
<?php

declare(strict_types=1);

namespace [PackageNamespace]\Tests;

use Facebook\WebDriver\Chrome\ChromeOptions;
use Facebook\WebDriver\Remote\DesiredCapabilities;
use Facebook\WebDriver\Remote\RemoteWebDriver;
use Illuminate\Foundation\Application;
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
     * Create the RemoteWebDriver instance.
     *
     * Headless by default. To run with a visible Chrome window (for debugging
     * a failing Browser test), set DUSK_HEADLESS=false in the environment:
     *
     *     DUSK_HEADLESS=false composer run test:web
     */
    #[Override]
    protected function driver(): RemoteWebDriver
    {
        $headless = filter_var(
            $_ENV['DUSK_HEADLESS'] ?? getenv('DUSK_HEADLESS') ?? 'true',
            FILTER_VALIDATE_BOOLEAN
        );

        $args = [
            '--window-size=1920,1080',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage',
        ];

        if ($headless) {
            $args[] = '--headless=new';
            $args[] = '--disable-search-engine-choice-screen';
        }

        $options = (new ChromeOptions())->addArguments($args);

        return RemoteWebDriver::create(
            $_ENV['DUSK_DRIVER_URL'] ?? 'http://localhost:9515',
            DesiredCapabilities::chrome()->setCapability(ChromeOptions::CAPABILITY, $options)
        );
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
}
```

### Browser Test Example — Nova Resource (Smoke Test ONLY)

Browser tests are **smoke tests only**. Their single job: verify the page renders
without throwing. No business assertions, no validation flows, no CRUD round-trips.
Two tests per Resource — create form and detail page. Both assert the page renders
without 500/exception markers.

**Why so minimal:** business correctness lives in Feature tests (Actions). The UI
layer only needs to prove "the resource is wired correctly — fields render, no
missing relations, no enum mismatches, no provider/binding errors".

```php
<?php

declare(strict_types=1);

namespace [PackageNamespace]\Tests\Browser;

use Laravel\Dusk\Browser;
use [PackageNamespace]\Models\[ModelName];
use [PackageNamespace]\Tests\DuskTestCase;
use PHPUnit\Framework\Attributes\Test;

final class [ResourceName]ResourceTest extends DuskTestCase
{
    #[Test]
    final public function create_page_renders_without_exceptions(): void
    {
        $this->browse(function (Browser $browser): void {
            $this->loginToNova($browser)
                ->visit('/nova/resources/[uri-key]/new')
                ->waitForText('Create [Singular Label]')
                ->assertDontSee('SERVER ERROR')
                ->assertDontSee('Whoops')
                ->assertDontSee('Exception')
                ->assertSee('Create [Singular Label]');
        });
    }

    #[Test]
    final public function detail_page_renders_without_exceptions(): void
    {
        $record = [ModelName]::factory()->create();

        $this->browse(function (Browser $browser) use ($record): void {
            $this->loginToNova($browser)
                ->visit('/nova/resources/[uri-key]/' . $record->getKey())
                ->waitFor('[dusk="[uri-key]-detail-component"]', 10)
                ->assertDontSee('SERVER ERROR')
                ->assertDontSee('Whoops')
                ->assertDontSee('Exception');
        });
    }
}
```

**Anti-patterns — do NOT do this in Browser tests:**
- ❌ Typing into fields and pressing Create (that's a Feature test concern)
- ❌ Asserting validation error messages (that's a Feature test concern)
- ❌ Asserting business outcomes after submit (that's a Feature test concern)
- ❌ Multiple test methods per page (one smoke per page is enough)

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

### Nova UI Text Reference

| Element | Text |
|---------|------|
| Login button | `Log In` (with space, NOT "Login") |
| Dashboard heading | `Get Started` |
| Create button | `Create [Singular Label]` |
| Update button | `Update [Singular Label]` |
| Delete modal trigger | `@open-delete-modal-button` |
| Delete confirm button | `Delete` |

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

        // One record per aggregate root — minimum for Browser smoke tests
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
