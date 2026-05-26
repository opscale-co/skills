---
name: opscale-test
description: >
  Configures the complete testing and code quality stack AND generates the actual
  Unit, Feature, and Browser tests for an Opscale/Laravel Nova package. Configures
  Pest PHP with Orchestra Testbench, Laravel Dusk with Nova DevTool, and the full
  static analysis suite (PHPStan, Duster, Rector). Then walks src/Models, src/Services/Actions,
  and src/Nova and spawns unit-test-generator, feature-test-generator, and
  web-test-generator agents in parallel to produce the actual test files. Use this
  skill whenever a module needs its testing layer built, or when the user says
  "configure tests", "set up testing", "generate tests", "add linting", "configure
  static analysis", or "set up the quality stack". This is Step 9 in the Opscale
  sequence, runs after opscale-debug and before opscale-release.
---

# opscale-test

## Prerequisites — flexible

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | Inside a PHP/Laravel project | `composer.json` exists | Stop. Re-run `/opscale-init`. |
| 3 | (To generate Unit tests) `src/Models/` populated | List files | Run `/opscale-domain` first OR proceed and the Unit-test generator will produce zero files. |
| 4 | (To generate Feature tests) `src/Services/Actions/` populated | List files | Run `/opscale-logic` first OR proceed without Feature tests. |
| 5 | (To generate Browser tests) `src/Nova/` populated | List files | Run `/opscale-ui` first OR proceed without Browser tests. |

This skill belongs to the **Review phase**. The Review phase (`debug`, `test`, `release`) can be invoked at any point after `opscale-init`. You can:
- Configure the stack early (no source files) and generate tests later as Generate-phase output appears.
- Or run after the full Generate phase to configure and generate in one shot — recommended for new modules.

The strict order **inside** Review is: `test` MUST run before `release`.

## Purpose

Configure the complete testing and code quality stack AND generate the actual
test files for an Opscale package:

| Tool | Purpose |
|------|---------|
| **Pest PHP** | Test runner with expressive syntax (backward-compatible with PHPUnit) |
| **Orchestra Testbench** | Laravel package testing framework |
| **Nova DevTool + Testbench Dusk** | Browser/E2E testing against Nova UI in package context |
| **PHPStan + Larastan** | Static analysis at level 8+ |
| **Duster** | Opinionated PHP + JS/Vue linting (TLint + CodeSniffer + CS Fixer + Pint) |
| **Rector** | Automated code modernization and refactoring |

---

## Installation

```bash
# Pest must allow its plugin — do this FIRST
composer config allow-plugins.pestphp/pest-plugin true

# Testing
composer require pestphp/pest pestphp/pest-plugin-laravel --dev --with-all-dependencies
composer require orchestra/testbench-dusk --dev
composer require mockery/mockery --dev

# Nova DevTool (usually already present in Nova packages)
composer require laravel/nova-devtool --dev

# Static analysis (usually already present)
composer require larastan/larastan --dev
composer require opscale-co/strict-rules --dev

# Linting & modernization (usually already present)
composer require tightenco/duster --dev
composer require rector/rector --dev
```

### ChromeDriver

After installing `orchestra/testbench-dusk`, install ChromeDriver matching the local Chrome version:

```bash
# Check Chrome version first
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --version

# Install matching ChromeDriver (replace 146 with your Chrome major version)
./vendor/bin/testbench dusk:chrome-driver 146
```

**IMPORTANT**: ChromeDriver version must match the installed Chrome browser version exactly.
If Chrome auto-updates, re-run this command.

#### macOS arm gotcha — verified

On Apple Silicon (M1/M2/M3/M4), `testbench dusk:chrome-driver --detect` may
create an empty directory at `vendor/laravel/dusk/bin/chromedriver-mac-arm64/`
alongside the actual binary at `vendor/laravel/dusk/bin/chromedriver-mac-arm`
(no suffix). The empty directory is the `--detect` glitch; the binary is
correct.

To run ChromeDriver manually for debugging Dusk:

```bash
# Strip macOS quarantine (binary downloaded over the network is quarantined)
xattr -dr com.apple.quarantine vendor/laravel/dusk/bin/chromedriver-mac-arm

# Make sure it's executable
chmod 755 vendor/laravel/dusk/bin/chromedriver-mac-arm

# Verify version matches Chrome
vendor/laravel/dusk/bin/chromedriver-mac-arm --version

# Start it on the default port
vendor/laravel/dusk/bin/chromedriver-mac-arm --port=9515
```

Common error symptoms and fixes:
- `Permission denied` running chromedriver → `chmod 755` + `xattr -dr` (above)
- Tests time out with no error → wrong binary path (`chromedriver-mac-arm64/`
  is the empty dir, not the binary; use `chromedriver-mac-arm`)
- `session not created: Chrome version mismatch` → re-run
  `vendor/bin/testbench dusk:chrome-driver {major-version}`

---

## Three Test Suites

```
tests/
├── Pest.php              ← Bootstraps TestCase for Unit + Feature
├── TestCase.php          ← Base for Unit + Feature (Orchestra Testbench)
├── DuskTestCase.php      ← Base for Browser (Orchestra Testbench Dusk)
├── Unit/                 ← Isolated component tests (Model, Event, Repository, Action metadata)
├── Feature/              ← Integration tests (Actions, API endpoints, abilities, commands)
└── Browser/              ← Dusk browser tests against Nova UI
    ├── screenshots/      ← Auto-captured on failure
    └── console/          ← Browser console logs on failure
```

| Suite | Layer | What it tests | Runner | DB | Source dir |
|-------|-------|--------------|--------|-----|------------|
| **Unit** | **Domain** | Models, Enums, Value Objects, Repositories, Migrations/Schema | Pest | In-memory SQLite | `src/Models/`, `src/Models/Enums/`, `src/Models/ValueObjects/`, `src/Models/Repositories/`, `database/migrations/` |
| **Feature** | **Actions** | Each Action class executed end-to-end with real DB, real events, real side effects (no DB mocks) | Pest | In-memory SQLite | `src/Services/Actions/` |
| **Browser** | **UI (Nova)** | Smoke test per Nova Resource: navigate index, open create form, open detail of a seeded record — verify no exceptions / no 500 | Pest + Dusk | Workbench SQLite file | `src/Nova/` |

**Strict layer assignment — no overlap:**
- Domain logic (model methods, VO immutability, enum transitions, schema) → **Unit only**
- Business operations (Action::handle, events, persistence) → **Feature only**
- Nova UI smoke (resource pages render without throwing) → **Browser only**

A test belongs to exactly one suite. Do not write Feature tests for models, Unit tests for Actions, or Browser tests with business assertions.

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

## Browser Tests with Nova DevTool + Testbench Dusk

### Architecture

Browser tests run in a fundamentally different way than Unit/Feature tests:

1. **Testbench Dusk** starts a real PHP built-in server on a configurable port
2. The server serves the workbench app (with Nova, migrations, seeders)
3. **ChromeDriver** controls a real Chrome browser
4. The browser makes HTTP requests to the server
5. Tests interact with the page via Dusk's browser API

**Key implication**: The test process and the server process are SEPARATE. They share the
same SQLite database file (from `workbench:build`), but NOT in-memory state. Data created
with factories in the test process may not exist in the server process unless it's written
to the shared SQLite file.

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

### Workbench Build — REQUIRED before Browser tests

Before running Browser tests, the workbench must be built to create the SQLite database,
run migrations, seed data, and publish Nova assets:

```bash
./vendor/bin/testbench workbench:build
```

### Nova Assets — Dusk skeleton needs them

**CRITICAL**: The Dusk server uses its own skeleton at `vendor/orchestra/testbench-dusk/laravel/`.
Nova assets (JS, CSS, mix-manifest.json) must exist in this skeleton's `public/vendor/nova/`
directory. They are NOT automatically copied from the testbench-core skeleton.

Copy them after `workbench:build`:

```bash
cp -R vendor/orchestra/testbench-core/laravel/public/vendor \
      vendor/orchestra/testbench-dusk/laravel/public/vendor
```

Also copy the database:

```bash
cp vendor/orchestra/testbench-core/laravel/database/database.sqlite \
   vendor/orchestra/testbench-dusk/laravel/database/
```

### View Cache — Must be cleared

After copying assets or changing providers, clear the Blade view cache in BOTH skeletons:

```bash
rm -rf vendor/orchestra/testbench-dusk/laravel/storage/framework/views/*
rm -rf vendor/orchestra/testbench-core/laravel/storage/framework/views/*
```

**If you see `@inertia` as literal text in screenshots**, the view cache is stale.

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

## Seeders — Required for Browser Tests

Browser tests run against the **workbench** (Nova DevTool skeleton). Since Browser
tests are smoke tests against detail pages, they need at least one persisted record
per Resource. **A minimal seeder per aggregate root is REQUIRED.**

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

## Test Generation — After Configuration

Once the configuration above is in place, the skill **walks `src/` and spawns
generator agents in parallel** to produce the actual test files.

### Generation walk

| Source directory | Agent | Suite | One agent per |
|------------------|-------|-------|---------------|
| `src/Models/*.php` (non-enum, non-VO) | `unit-test-generator` (type=model) | Unit | Model class |
| `src/Models/Enums/*.php` | `unit-test-generator` (type=enum) | Unit | Enum class |
| `src/Models/ValueObjects/*.php` | `unit-test-generator` (type=value_object) | Unit | VO class |
| `src/Models/Repositories/*.php` | `unit-test-generator` (type=repository) | Unit | Repository trait |
| `database/migrations/*.php` | `unit-test-generator` (type=migration) | Unit | Table |
| `src/Services/Actions/*.php` | `feature-test-generator` | Feature | Action class |
| `src/Nova/*.php` (Resources only — not Concerns/, not Repeatables/, not Actions/, not Metrics/) | `web-test-generator` | Browser | Nova Resource |

### Invocation order

1. Configure stack (Pest, Dusk, PHPStan, Duster, Rector) — sections above
2. Generate `workbench/database/seeders/DatabaseSeeder.php` with one factory call per aggregate root
3. Spawn all agents **in parallel** (single message, multiple Agent tool calls)
4. After agents finish, run `composer run build` then `composer run test` to validate

### What each agent produces

- **`unit-test-generator`** → one or more `tests/Unit/{Type}/{Name}Test.php` files testing domain in isolation (no Action calls, no Nova)
- **`feature-test-generator`** → one `tests/Feature/{ActionName}Test.php` per Action, calling `Action::run()` against real DB, asserting events dispatched and state persisted
- **`web-test-generator`** → one `tests/Browser/{Resource}ResourceTest.php` per Nova Resource with exactly two tests: `create_page_renders_without_exceptions`, `detail_page_renders_without_exceptions`

**Do NOT generate cross-suite tests** — no Feature test for a model, no Unit test for an Action, no Browser test with business asserts.

---

## PHPStan + Larastan

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

## Duster

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

## Rector

Use the existing rector.php if present. The standard Opscale configuration uses:

- PHP 8.2+ rules
- Laravel-specific rules (Eloquent, Collections)
- PHPUnit-to-attributes migration
- Code quality, dead code, naming, type declaration

---

## composer.json scripts — REQUIRED per module

Every Opscale module/package MUST define `build` and `serve` composer scripts so any
contributor (or CI) can recreate the Browser test environment and inspect the workbench
Nova UI locally without remembering the multi-step incantation.

```json
{
    "scripts": {
        "build": [
            "@php vendor/bin/testbench workbench:build",
            "@php vendor/bin/testbench package:discover --ansi",
            "cp -R vendor/orchestra/testbench-core/laravel/public/vendor vendor/orchestra/testbench-dusk/laravel/public/vendor",
            "cp vendor/orchestra/testbench-core/laravel/database/database.sqlite vendor/orchestra/testbench-dusk/laravel/database/database.sqlite",
            "rm -rf vendor/orchestra/testbench-core/laravel/storage/framework/views/*",
            "rm -rf vendor/orchestra/testbench-dusk/laravel/storage/framework/views/*",
            "@php vendor/bin/testbench dusk:chrome-driver --detect"
        ],
        "serve": "@php vendor/bin/testbench serve",
        "lint": "./vendor/bin/duster lint --dirty",
        "fix": "./vendor/bin/duster fix --dirty",
        "refactor": "./vendor/bin/rector process",
        "analyse": "./vendor/bin/phpstan analyse --memory-limit=512M",
        "test": "./vendor/bin/pest --testsuite=Unit,Feature",
        "test:unit": "./vendor/bin/pest --testsuite=Unit",
        "test:feature": "./vendor/bin/pest --testsuite=Feature",
        "test:web": "@composer build && ./vendor/bin/pest -c phpunit.dusk.xml",
        "test:coverage": "XDEBUG_MODE=coverage ./vendor/bin/pest --testsuite=Unit,Feature --coverage --min=80",
        "check": "@composer fix && @composer refactor && @composer lint && @composer analyse && @composer test"
    }
}
```

**Key design decisions**:
- `composer run build` — single command that **recreates the entire test/workbench environment**: builds workbench, runs seeders, publishes Nova assets to BOTH skeletons, copies the SQLite DB, clears view caches in both skeletons, syncs ChromeDriver. **MUST be runnable from a clean clone after `composer install`.**
- `composer run serve` — runs Testbench's built-in PHP server with the workbench mounted. Lets the developer browse the actual Nova UI at `http://localhost:8000/nova` to manually verify Resources outside of Dusk.
- `test:web` chains `build` so Browser tests always run against a freshly rebuilt workbench — eliminates "works on my machine" caused by stale skeletons.
- **Browser tests run headless by default** — `DUSK_HEADLESS=true` is the default (configured in `DuskTestCase::driver()`). CI never sees a visible browser. To debug a failing Browser test locally with a visible Chrome window, override per-invocation:
  ```bash
  DUSK_HEADLESS=false composer run test:web
  ```
- `test` runs Unit+Feature only (no ChromeDriver dependency for CI fast path).
- `check` is the full pipeline: fix → refactor → lint → analyse → test.
- `analyse` includes `--memory-limit=512M` to prevent OOM with strict-rules.

### package.json scripts (mirror)

For consistency, mirror the same names in `package.json` (delegating to composer):

```json
{
    "scripts": {
        "build": "composer run build",
        "serve": "composer run serve",
        "lint": "composer run lint",
        "fix": "composer run fix",
        "refactor": "composer run refactor",
        "analyse": "composer run analyse",
        "test": "composer run test",
        "test:web": "composer run test:web",
        "check": "composer run check"
    }
}
```

---

## Event Listener Registration

When registering Action classes as event listeners, always specify the method explicitly:

```php
// WRONG — Laravel calls handle() with the event object, causing TypeError
Event::listen(SomeEvent::class, SomeAction::class);

// CORRECT — routes to the asListener() method
Event::listen(SomeEvent::class, [SomeAction::class, 'asListener']);
```

This is because `opscale-co/actions` (built on laravel-actions) uses `asListener()` for
event handling, but Laravel's dispatcher defaults to calling `handle()` when given a class name.

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

## Completeness Checklist

```
TEST CONFIGURATION + GENERATION GATE
──────────────────────────────────────────────────────
CONFIGURATION
[ ] Pest installed with pest-plugin-laravel
[ ] composer allow-plugins.pestphp/pest-plugin set to true
[ ] Orchestra Testbench Dusk installed (Nova DevTool present)
[ ] mockery/mockery installed
[ ] tests/TestCase.php created (Unit + Feature base)
[ ] tests/DuskTestCase.php created (Browser base, extends Testbench Dusk, headless-by-default driver() override)
[ ] tests/Pest.php bootstraps TestCase for Unit + Feature only
[ ] phpunit.xml configured with Unit + Feature + Browser suites
[ ] phpunit.dusk.xml configured with Browser suite only (minimal env)
[ ] testbench.yaml includes ALL required providers for Nova + Dusk
[ ] ChromeDriver installed matching local Chrome version

WORKBENCH + SEEDERS
[ ] workbench/database/seeders/DatabaseSeeder.php created
[ ] Admin user seeded (admin@laravel.com / password) for loginToNova()
[ ] One factory call per aggregate root in seeder (1–3 records each)
[ ] composer run build executes end-to-end on a clean clone
[ ] composer run serve serves /nova at http://localhost:8000/nova
[ ] Nova assets present in testbench-dusk skeleton (build script copies them)
[ ] View cache cleared in both skeletons (build script clears them)

GENERATED TESTS — STRICT LAYER ASSIGNMENT
[ ] Unit test exists for every Model in src/Models/
[ ] Unit test exists for every Enum in src/Models/Enums/
[ ] Unit test exists for every Value Object in src/Models/ValueObjects/
[ ] Unit test exists for every Repository in src/Models/Repositories/
[ ] Unit (schema) test exists for every migration
[ ] Feature test exists for every Action in src/Services/Actions/ (real DB, real events)
[ ] Browser smoke test exists for every Nova Resource in src/Nova/ (create + detail render, no exceptions)
[ ] NO cross-suite tests: no Feature tests for models, no Unit tests for Actions, no Browser tests with business asserts

STATIC ANALYSIS + LINT
[ ] phpstan.neon configured at level 9 with all four strict-rules sets
[ ] PHPStan passes with zero errors (--memory-limit=512M)
[ ] pint.json configured with declare_strict_types
[ ] duster.json configured with phpstan disabled in lint/fix scripts
[ ] Duster lint passes clean (including TLint — no \Namespace prefixes)
[ ] rector.php configured

SCRIPTS
[ ] composer scripts: build, serve, lint, fix, refactor, analyse, test, test:unit, test:feature, test:web, test:coverage, check
[ ] package.json mirrors the same names (build, serve, test, test:web, check, ...)
[ ] composer run check passes (fix → refactor → lint → analyse → test)
[ ] composer run test:web passes (Browser tests, headless by default)
──────────────────────────────────────────────────────
STATUS: [ ] PASS — opscale-release may proceed
        [ ] FAIL — list blocking items below
```

---

## Domain Rules

1. **The skill configures AND generates** — configuration without generated tests is incomplete. After configuring the stack, the skill MUST walk `src/` and spawn `unit-test-generator`, `feature-test-generator`, and `web-test-generator` agents in parallel to produce real test files.
2. **Strict layer assignment — no overlap:**
   - Unit (`tests/Unit/`) → **Domain only**: Models, Enums, Value Objects, Repositories, Migrations/Schema. One test class per domain component.
   - Feature (`tests/Feature/`) → **Actions only**: one test per class in `src/Services/Actions/`. Hits real DB, asserts events, asserts state. **No DB mocks.**
   - Browser (`tests/Browser/`) → **Nova UI smoke only**: one test class per Resource in `src/Nova/`, exactly two methods (create page renders, detail page renders), assert no exceptions / no 500. **No business asserts.**
3. **Browser tests use Nova DevTool + Testbench Dusk + Workbench** — `DuskTestCase` extends `Orchestra\Testbench\Dusk\TestCase` with `WithWorkbench`. Tests run against the workbench skeleton, not against the host app.
4. **Workbench seeders are mandatory** — `workbench/database/seeders/DatabaseSeeder.php` MUST seed: (a) the `admin@laravel.com / password` user used by `loginToNova()`, and (b) 1–3 records per aggregate root so detail-page smoke tests can resolve a real record.
5. **`composer run build` is the single environment-recreation command** — builds workbench, copies Nova assets to both skeletons, copies SQLite DB, clears view caches, syncs ChromeDriver. MUST work from a clean clone.
6. **`composer run serve` is mandatory** — runs `testbench serve` so any developer can browse the workbench Nova UI at `http://localhost:8000/nova` outside of Dusk.
7. **Browser tests run headless by default** — `DUSK_HEADLESS=true` is configured in `DuskTestCase::driver()`. CI never sees a visible browser. Override with `DUSK_HEADLESS=false composer run test:web` to debug locally.
8. **`test:web` always rebuilds the workbench** — `composer run test:web` chains `composer run build` first. Stale skeletons are the #1 cause of flaky Browser tests.
9. **Browser tests run separately from `test` / `check`** — via `composer run test:web` with `phpunit.dusk.xml`. They are NOT included in `composer run test` because they require ChromeDriver.
10. **Login via browser form** — use the `loginToNova()` helper that types credentials into the Nova login form. Avoid `loginAs()` as it requires the user to exist in the server's DB.
11. **PHPStan level 9** — all four `strict-rules` rule sets active. Documented ignores for tests (DIP, helpers), Nova (`__()` translations), controllers (try-catch at HTTP boundary), service providers (Laravel patterns).
12. **`declare(strict_types=1)`** enforced by Pint via `duster fix`.
13. **TLint compliance** — always use `use` imports, never `\Fully\Qualified\Class` in code.
14. **Event listeners must specify method** — `[Action::class, 'asListener']` not `Action::class`.
15. **`composer run check`** runs fix + refactor + lint + analyse + test — this is the CI entry point.
