---
name: opscale-test
description: >
  Configures the complete testing and code quality stack for an Opscale/Laravel Nova
  package: Pest PHP with Orchestra Testbench, Laravel Dusk with Nova DevTool for
  browser testing, and the full static analysis suite (PHPStan, Duster, Rector).
  Use this skill whenever a module needs its testing infrastructure set up, or when
  the user says "configure tests", "set up testing", "add linting", "configure
  static analysis", or "set up the quality stack". This is Step 9 in the Opscale
  sequence, runs after opscale-debug and before opscale-release.
---

# opscale-test

## Purpose

Configure the complete testing and code quality stack for an Opscale package:

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

| Suite | What it tests | Runner | DB |
|-------|--------------|--------|-----|
| **Unit** | Components in isolation — models, events, repositories, action metadata | Pest | In-memory SQLite |
| **Feature** | Integration — Actions execution, API endpoints, token abilities, validation, commands | Pest | In-memory SQLite |
| **Browser** | Nova UI via real browser — login, resource CRUD, form validation | Pest + Dusk | Workbench SQLite file |

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

### Browser Test Example — Nova Resource

```php
<?php

declare(strict_types=1);

namespace [PackageNamespace]\Tests\Browser;

use Laravel\Dusk\Browser;
use [PackageNamespace]\Tests\DuskTestCase;
use PHPUnit\Framework\Attributes\Test;

final class [ResourceName]ResourceTest extends DuskTestCase
{
    #[Test]
    final public function can_navigate_to_resource(): void
    {
        $this->browse(function (Browser $browser): void {
            $this->loginToNova($browser)
                ->visit('/nova/resources/[uri-key]')
                ->waitForText('[Resource Label]')
                ->assertSee('[Resource Label]');
        });
    }

    #[Test]
    final public function can_see_create_form(): void
    {
        $this->browse(function (Browser $browser): void {
            $this->loginToNova($browser)
                ->visit('/nova/resources/[uri-key]/new')
                ->waitForText('Create [Singular Label]')
                ->assertSee('[Field Name 1]')
                ->assertSee('[Field Name 2]');
        });
    }

    #[Test]
    final public function create_validates_required_fields(): void
    {
        $this->browse(function (Browser $browser): void {
            $this->loginToNova($browser)
                ->visit('/nova/resources/[uri-key]/new')
                ->waitForText('Create [Singular Label]')
                ->press('Create [Singular Label]')
                ->waitForText('The [field] field is required')
                ->assertSee('The [field] field is required');
        });
    }

    #[Test]
    final public function can_create_resource(): void
    {
        $this->browse(function (Browser $browser): void {
            $this->loginToNova($browser)
                ->visit('/nova/resources/[uri-key]/new')
                ->waitForText('Create [Singular Label]')
                ->type('@[field-attribute]', '[value]')
                // For MorphTo fields, use the Dusk selectors:
                // ->select('@[relation]-type', '[resource-uri-key]')
                // ->pause(500)
                // ->select('@[relation]-select', '[id]')
                ->press('Create [Singular Label]')
                ->waitForText('[expected text after creation]')
                ->assertSee('[expected text]');
        });
    }
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

## package.json scripts

```json
{
    "scripts": {
        "lint": "./vendor/bin/duster lint --dirty",
        "fix": "./vendor/bin/duster fix --dirty",
        "refactor": "./vendor/bin/rector process",
        "analyse": "./vendor/bin/phpstan analyse --memory-limit=512M",
        "test": "./vendor/bin/pest --testsuite=Unit,Feature",
        "test:unit": "./vendor/bin/pest --testsuite=Unit",
        "test:feature": "./vendor/bin/pest --testsuite=Feature",
        "test:web": "./vendor/bin/pest -c phpunit.dusk.xml",
        "test:coverage": "XDEBUG_MODE=coverage ./vendor/bin/pest --testsuite=Unit,Feature --coverage --min=80",
        "check": "npm run fix && npm run refactor && npm run lint && npm run analyse && npm run test"
    }
}
```

**Key design decisions**:
- `test` runs Unit+Feature only (no ChromeDriver dependency for CI fast path)
- `test:web` runs Browser tests with separate `phpunit.dusk.xml` config
- `check` is the full pipeline: fix → refactor → lint → analyse → test
- `analyse` includes `--memory-limit=512M` to prevent OOM with strict-rules

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
TEST CONFIGURATION GATE
──────────────────────────────────────────────────────
[ ] Pest installed with pest-plugin-laravel
[ ] composer allow-plugins.pestphp/pest-plugin set to true
[ ] Orchestra Testbench Dusk installed
[ ] mockery/mockery installed
[ ] tests/TestCase.php created (Unit + Feature base)
[ ] tests/DuskTestCase.php created (Browser base, extends Testbench Dusk)
[ ] tests/Pest.php bootstraps TestCase for Unit + Feature only
[ ] phpunit.xml configured with Unit + Feature + Browser suites
[ ] phpunit.dusk.xml configured with Browser suite only (minimal env)
[ ] testbench.yaml includes ALL required providers for Nova + Dusk
[ ] ChromeDriver installed matching local Chrome version
[ ] workbench:build run (DB, migrations, seeders, assets)
[ ] Nova assets copied to testbench-dusk skeleton
[ ] View cache cleared in both skeletons
[ ] Unit test exists for every Opscale Action in src/Services/Actions/
[ ] Feature test exists for API endpoints, abilities, validation
[ ] Browser test exists for Nova resource UI (login, list, create, validate)
[ ] phpstan.neon configured at level 9 with all four strict-rules sets
[ ] PHPStan passes with zero errors (--memory-limit=512M)
[ ] pint.json configured with declare_strict_types
[ ] duster.json configured with phpstan disabled in lint/fix scripts
[ ] Duster lint passes clean (including TLint — no \Namespace prefixes)
[ ] rector.php configured
[ ] npm scripts: test, test:unit, test:feature, test:web, analyse, check
[ ] npm run check passes (fix → refactor → lint → analyse → test)
[ ] npm run test:web passes (Browser tests)
──────────────────────────────────────────────────────
STATUS: [ ] PASS — opscale-release may proceed
        [ ] FAIL — list blocking items below
```

---

## Domain Rules

1. **Three test suites** — Unit (isolated components), Feature (integration with DB/HTTP/events), Browser (Dusk tests against Nova UI via real browser).
2. **Browser tests use Nova DevTool + Testbench Dusk** — NOT standard Laravel Dusk. The DuskTestCase extends `Orchestra\Testbench\Dusk\TestCase` with `WithWorkbench` trait.
3. **Browser tests run separately** — via `npm run test:web` with `phpunit.dusk.xml`. They are NOT included in `npm run test` or `npm run check` because they require ChromeDriver.
4. **Login via browser form** — use the `loginToNova()` helper that types credentials into the Nova login form. Avoid `loginAs()` as it requires the user to exist in the server's DB (not the test's in-memory DB).
5. **Workbench data is shared** — Browser tests use the seeded workbench database. Use `firstOrCreate` or reference seeded users instead of creating new records with factories.
6. **PHPStan level 9** — all four `strict-rules` rule sets active. Documented ignores for tests (DIP, helpers), Nova (`__()` translations), controllers (try-catch at HTTP boundary), and service providers (Laravel patterns).
7. **`declare(strict_types=1)`** enforced by Pint via `duster fix`.
8. **TLint compliance** — always use `use` imports, never `\Fully\Qualified\Class` in code.
9. **Event listeners must specify method** — `[Action::class, 'asListener']` not `Action::class`.
10. **`npm run check`** runs fix + refactor + lint + analyse + test — this is the CI entry point.
