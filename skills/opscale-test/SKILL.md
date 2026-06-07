---
name: opscale-test
description: >
  Configures the testing/quality stack and generates Unit, Feature, and Browser
  tests. Step 9 of Review — runs after opscale-debug, before opscale-release.
  Trigger: "configure tests", "set up testing", "generate tests", "set up the
  quality stack".
  Use it whenever the testing/quality stack or test generation is needed, even loosely phrased. Not for debug tooling (opscale-debug) or the release pipeline (opscale-release).
---

# opscale-test

## Prerequisites — flexible

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | Inside a PHP/Laravel project | `composer.json` exists | Stop. Re-run `/opscale-init`. |
| 3 | (To generate Unit tests) `src/Models/` populated | List files | Run `/opscale-domain` first OR proceed and the Unit-test generator will produce zero files. |
| 4 | (To generate Feature tests) `src/Services/Actions/` populated | List files | Run `/opscale-logic` first OR proceed without Feature tests. |
| 5 | (To generate Browser tests) `src/Nova/` populated AND spec.md has *Procesos identificados* | List files | Run `/opscale-ui` and `/opscale-process` first OR proceed without Browser tests. |

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
| **Browser** | **UI (Nova)** | One test **per identified process**: drive the full process flow through Nova — every step's screen renders and the process runs end to end without exceptions / no 500 | Pest + Dusk | Workbench SQLite file | spec.md *Procesos identificados* + `src/Nova/` |

**Strict layer assignment — no overlap:**
- Domain logic (model methods, VO immutability, enum transitions, schema) → **Unit only**
- Business operations (Action::handle, events, persistence) → **Feature only**
- Nova UI smoke (resource pages render without throwing) → **Browser only**

A test belongs to exactly one suite. Do not write Feature tests for models, Unit tests for Actions, or Browser tests with business assertions.

---

## Test config files (phpunit + base test cases)

The verbatim contents of `phpunit.xml`, `phpunit.dusk.xml`, `tests/TestCase.php`
and `tests/Pest.php` live in `references/test-configs.md`. Copy them from there
during Installation.

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

The full `testbench.yaml` provider list is in `references/test-configs.md`.

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

### Browser test files (DuskTestCase, example, Nova selectors)

`tests/DuskTestCase.php`, a smoke-test example, and the Nova Dusk selector /
UI-text reference tables live in `references/test-configs.md`. Read that file
when writing Browser tests.

## Seeders — Required for Browser Tests

Browser tests run against the **workbench** (Nova DevTool skeleton). Since Browser
tests are smoke tests against detail pages, they need at least one persisted record
per Resource. **A minimal seeder per aggregate root is REQUIRED.**

### workbench/database/seeders/DatabaseSeeder.php

The workbench `DatabaseSeeder` template is in `references/test-configs.md`.

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
| spec.md *Procesos identificados* (driving the `src/Nova/` screens they touch) | `web-test-generator` | Browser | identified process |

### Invocation order

1. Configure stack (Pest, Dusk, PHPStan, Duster, Rector) — sections above
2. Generate `workbench/database/seeders/DatabaseSeeder.php` with one factory call per aggregate root
3. Spawn all agents **in parallel** (single message, multiple Agent tool calls)
4. After agents finish, run `composer run build` then `composer run test` to validate

### What each agent produces

- **`unit-test-generator`** → one or more `tests/Unit/{Type}/{Name}Test.php` files testing domain in isolation (no Action calls, no Nova)
- **`feature-test-generator`** → one `tests/Feature/{ActionName}Test.php` per Action, calling `Action::run()` against real DB, asserting events dispatched and state persisted
- **`web-test-generator`** → one `tests/Browser/{Process}FlowTest.php` **per process** in spec.md *Procesos identificados*, driving the whole process through Nova (navigate, fill the screens the process touches, advance through its steps) and asserting it completes without exceptions / no 500. Any Resource no process touches gets a minimal render smoke.

**Do NOT generate cross-suite tests** — no Feature test for a model, no Unit test for an Action, no Browser test with business asserts.

---

## PHPStan + Larastan

### phpstan.neon

The full `phpstan.neon` (Larastan config) is in `references/test-configs.md`.

## Duster

### duster.json + pint.json

Both `duster.json` and `pint.json` live in `references/test-configs.md`.

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

Dusk 500s, port conflicts, ChromeDriver mismatches and session-persistence
issues are catalogued in `references/test-configs.md` (Troubleshooting). Consult
it when a Browser test fails unexpectedly.

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
[ ] One Browser flow test exists per process in spec.md *Procesos identificados* (drives the full flow end to end, no exceptions)
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
   - Browser (`tests/Browser/`) → **process flows**: one test class per process in spec.md *Procesos identificados*, driving the full flow through Nova and asserting it runs end to end without exceptions / no 500. Heavy business asserts stay in Feature tests.
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
