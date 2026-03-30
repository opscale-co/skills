---
name: opscale-test
description: >
  Configures the complete testing and code quality stack for an Opscale/Laravel Nova
  package: Pest PHP with Orchestra Testbench, Laravel Dusk for browser testing, and
  the full static analysis suite (PHPStan, Duster, Rector). Use this skill whenever
  a module needs its testing infrastructure set up, or when the user says "configure
  tests", "set up testing", "add linting", "configure static analysis", or "set up
  the quality stack". This is Step 9 in the Opscale sequence, runs after opscale-debug
  and before opscale-release.
---

# opscale-test

## Purpose

Configure the complete testing and code quality stack for an Opscale package:

| Tool | Purpose |
|------|---------|
| **Pest PHP** | Test runner with expressive syntax |
| **Orchestra Testbench** | Laravel package testing framework |
| **Laravel Dusk** | Browser/E2E testing against the running app |
| **PHPStan + Larastan** | Static analysis at level 8 |
| **Duster** | Opinionated PHP + JS/Vue linting (Pint + ESLint) |
| **Rector** | Automated code modernization and refactoring |

---

## Installation

```bash
# Testing
composer require pestphp/pest --dev --with-all-dependencies
composer require pestphp/pest-plugin-laravel --dev
composer require orchestra/testbench --dev
composer require laravel/dusk --dev

# Static analysis
composer require nunomaduro/larastan --dev
composer require opscale-co/strict-rules --dev

# Linting & modernization
composer require tightenco/duster --dev
composer require rector/rector --dev
```

---

## Pest + Orchestra Testbench

### phpunit.xml.dist

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
    bootstrap="vendor/autoload.php"
    colors="true"
>
    <testsuites>
        <testsuite name="Unit">
            <directory>tests/Unit</directory>
        </testsuite>
        <testsuite name="Feature">
            <directory>tests/Feature</directory>
        </testsuite>
        <testsuite name="Web">
            <directory>tests/Web</directory>
        </testsuite>
    </testsuites>
    <source>
        <include>
            <directory>src</directory>
        </include>
    </source>
    <coverage>
        <report>
            <clover outputFile="coverage.xml"/>
        </report>
    </coverage>
</phpunit>
```

### tests/TestCase.php

```php
<?php

namespace [PackageNamespace]\Tests;

use Orchestra\Testbench\TestCase as OrchestraTestCase;
use [PackageNamespace]\[PackageName]ServiceProvider;

abstract class TestCase extends OrchestraTestCase
{
    protected function getPackageProviders($app): array
    {
        return [
            [PackageName]ServiceProvider::class,
        ];
    }

    protected function defineDatabaseMigrations(): void
    {
        $this->loadMigrationsFrom(__DIR__ . '/../database/migrations');
    }
}
```

### tests/Pest.php

```php
<?php

use [PackageNamespace]\Tests\TestCase;
use Tests\Browser\DuskTestCase;

uses(TestCase::class)->in('Feature', 'Unit');
uses(DuskTestCase::class)->in('Web');
```

### Test structure

```
tests/
├── Pest.php
├── TestCase.php
├── Unit/
│   └── Actions/
│       └── [ActionName]Test.php    (one per Opscale Action — isolated, no HTTP)
├── Feature/
│   └── [ModuleName]Test.php        (integration tests — DB, queues, events)
└── Web/
    └── [ModelName]ResourceTest.php  (Dusk browser tests against Nova UI)
```

### Unit test for an Opscale Action

```php
<?php

use [PackageNamespace]\Models\[ModelName];
use [PackageNamespace]\Services\Actions\[ActionName];

it('[describes what the action does in plain English]', function () {
    $[entity] = [ModelName]::factory()->create([
        'status' => [StatusEnum]::Pending,
    ]);

    $result = [ActionName]::run([
        '[entity_param]' => $[entity],
        '[scalar_param]' => '[value]',
    ]);

    expect($result['success'])->toBeTrue();
    expect($[entity]->fresh()->status)->toBe([StatusEnum]::Active);
});

it('returns failure when [business rule condition]', function () {
    $[entity] = [ModelName]::factory()->create([
        'status' => [StatusEnum]::Closed, // terminal state
    ]);

    $result = [ActionName]::run([
        '[entity_param]' => $[entity],
    ]);

    expect($result['success'])->toBeFalse();
});
```

---

## Laravel Dusk — Web Suite

### Installation

```bash
php artisan dusk:install
```

### DuskTestCase.php — configure for Nova

```php
<?php

namespace Tests\Browser;

use Facebook\WebDriver\Chrome\ChromeOptions;
use Facebook\WebDriver\Remote\DesiredCapabilities;
use Facebook\WebDriver\Remote\RemoteWebDriver;
use Laravel\Dusk\TestCase as BaseTestCase;
use Orchestra\Testbench\Dusk\Options as DuskOptions;

abstract class DuskTestCase extends BaseTestCase
{
    protected function driver(): RemoteWebDriver
    {
        $options = (new ChromeOptions)->addArguments(
            collect([
                '--window-size=1920,1080',
                '--disable-search-engine-choice-screen',
            ])->when($this->hasHeadlessDisabled(), fn ($items) => $items, fn ($items) => $items->merge([
                '--disable-gpu',
                '--headless=new',
            ]))->all()
        );

        return RemoteWebDriver::create(
            $_ENV['DUSK_DRIVER_URL'] ?? env('DUSK_DRIVER_URL') ?? 'http://localhost:9515',
            DesiredCapabilities::chrome()->setCapability(
                ChromeOptions::CAPABILITY, $options
            )
        );
    }
}
```

### Web suite test for a Nova Resource (`tests/Web/[ModelName]ResourceTest.php`)

```php
<?php

use Tests\Browser\DuskTestCase;
use Laravel\Dusk\Browser;

it('displays [ModelName] resource in Nova', function () {
    $this->browse(function (Browser $browser) {
        $browser->loginAs($this->user)
            ->visit('/nova/resources/[resource-uri]')
            ->assertSee('[Expected text]')
            ->assertPresent('@nova-resource-table');
    });
});
```

### .env.dusk.local

```env
APP_URL=http://localhost
DUSK_DRIVER_URL=http://localhost:9515
```

---

## PHPStan + Larastan

### phpstan.neon

```neon
includes:
    - vendor/nunomaduro/larastan/extension.neon
    - vendor/opscale-co/strict-rules/rules.clean.neon
    - vendor/opscale-co/strict-rules/rules.ddd.neon
    - vendor/opscale-co/strict-rules/rules.smells.neon
    - vendor/opscale-co/strict-rules/rules.solid.neon

parameters:
    level: 8
    phpVersion: 80300
    paths:
        - src
    ignoreErrors:
        # Add specific ignores with justification only — never blanket ignores
```

Run:

```bash
./vendor/bin/phpstan analyse
```

---

## Duster

Duster runs Pint (PHP style) + ESLint (JS/Vue) in one command.

### duster.json

```json
{
    "risky": false,
    "include": [
        "app",
        "src",
        "tests",
        "config",
        "routes"
    ],
    "exclude": [
        "bootstrap/cache",
        "storage",
        "vendor"
    ]
}
```

### pint.json (PHP style rules)

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

Run:

```bash
# Check only (CI)
./vendor/bin/duster lint

# Fix
./vendor/bin/duster fix
```

---

## Rector

### rector.php

```php
<?php

declare(strict_types=1);

use Rector\Config\RectorConfig;
use Rector\Set\ValueObject\LevelSetList;
use Rector\Set\ValueObject\SetList;

return RectorConfig::configure()
    ->withPaths([
        __DIR__ . '/src',
        __DIR__ . '/tests',
    ])
    ->withPhpSets(php83: true)
    ->withSets([
        SetList::CODE_QUALITY,
        SetList::DEAD_CODE,
        SetList::EARLY_RETURN,
        SetList::TYPE_DECLARATION,
    ])
    ->withSkip([
        // Add specific skips with justification only
    ]);
```

Run:

```bash
# Dry-run (show what would change)
./vendor/bin/rector --dry-run

# Apply
./vendor/bin/rector
```

---

## composer.json scripts

Add these to `composer.json` so the full quality suite runs with one command:

```json
{
    "scripts": {
        "test": "pest",
        "test:unit": "pest --testsuite=Unit",
        "test:feature": "pest --testsuite=Feature",
        "test:web": "pest --testsuite=Web",
        "test:coverage": "pest --coverage --min=80",
        "lint": "duster lint",
        "lint:fix": "duster fix",
        "analyse": "phpstan analyse",
        "refactor": "rector --dry-run",
        "refactor:apply": "rector",
        "quality": [
            "@lint",
            "@analyse",
            "@test"
        ]
    }
}
```

Run the full quality suite:

```bash
composer quality
```

---

## Completeness Checklist

```
TEST CONFIGURATION GATE
──────────────────────────────────────────────────────
[ ] Pest installed with pest-plugin-laravel
[ ] Orchestra Testbench installed and TestCase.php created
[ ] tests/Pest.php bootstraps TestCase
[ ] phpunit.xml.dist configured with source/coverage
[ ] Unit test exists for every Opscale Action in src/Services/Actions/
[ ] Feature test exists for each module flow
[ ] tests/Web/ directory created for Dusk tests
[ ] DuskTestCase applied to Web suite in Pest.php
[ ] Laravel Dusk installed and DuskTestCase.php configured
[ ] .env.dusk.local created
[ ] phpstan.neon configured at level 8 with all four strict-rules sets
[ ] PHPStan passes with zero errors
[ ] duster.json and pint.json configured
[ ] Duster lint passes clean
[ ] rector.php configured targeting PHP 8.3
[ ] composer.json scripts include test, lint, analyse, quality
[ ] composer quality passes end-to-end
──────────────────────────────────────────────────────
STATUS: [ ] PASS — opscale-release may proceed
        [ ] FAIL — list blocking items below
```

---

## Domain Rules

1. **Three test suites** — Unit (isolated Actions, no DB/HTTP), Feature (integration with DB/queues/events), Web (Dusk browser tests against Nova UI).
2. **Unit = isolation** — unit tests for Actions use factories and no HTTP context. Feature tests may use DB. Web tests run Dusk against the live app.
3. **PHPStan level 8** — all four `strict-rules` rule sets active. No blanket `ignoreErrors`.
4. **`declare(strict_types=1)`** enforced by Pint via `duster fix`.
5. **`composer quality`** runs lint + analyse + test in sequence — this is the CI entry point.
6. **Rector dry-run before apply** — always review `--dry-run` output before applying changes.
