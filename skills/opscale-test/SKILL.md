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

## Context

### Purpose

Configure the complete testing and code quality stack AND generate the actual test files for an Opscale package:

| Tool | Purpose |
|------|---------|
| **Pest PHP** | Test runner with expressive syntax (backward-compatible with PHPUnit) |
| **Orchestra Testbench** | Laravel package testing framework |
| **Nova DevTool + Testbench Dusk** | Browser/E2E testing against Nova UI in package context |
| **PHPStan + Larastan** | Static analysis at level 8+ |
| **Duster** | Opinionated PHP + JS/Vue linting (TLint + CodeSniffer + CS Fixer + Pint) |
| **Rector** | Automated code modernization and refactoring |

### Prerequisites — flexible

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | Inside a PHP/Laravel project | `composer.json` exists | Stop. Re-run `/opscale-init`. |
| 3 | (To generate Unit tests) `src/Models/` populated | List files | Run `/opscale-domain` first OR proceed and the Unit-test generator will produce zero files. |
| 4 | (To generate Feature tests) `src/Services/Actions/` populated | List files | Run `/opscale-logic` first OR proceed without Feature tests. |
| 5 | (To generate Browser tests) `src/Nova/` populated AND final/process.md has *Ordered flow* subprocesses | List files | Run `/opscale-ui` and `/opscale-process` first OR proceed without Browser tests. |

This skill belongs to the **Review phase**. The Review phase (`debug`, `test`, `release`) can be invoked at any point after `opscale-init`. The strict order **inside** Review is: `test` must run before `release`.

### Three test suites — strict layer assignment

```
tests/
├── Pest.php              <- Bootstraps TestCase for Unit + Feature
├── TestCase.php          <- Base for Unit + Feature (Orchestra Testbench)
├── DuskTestCase.php      <- Base for Browser (Orchestra Testbench Dusk)
├── Unit/                 <- Isolated component tests
├── Feature/              <- Integration tests (Actions, abilities, commands)
└── Browser/              <- Dusk browser tests against Nova UI
```

| Suite | Layer | What it tests | Runner | DB | Source dir |
|-------|-------|--------------|--------|-----|------------|
| **Unit** | **Domain** | Models, Enums, Value Objects, Repositories, Migrations/Schema | Pest | In-memory SQLite | `src/Models/`, `src/Models/Enums/`, `src/Models/ValueObjects/`, `src/Models/Repositories/`, `database/migrations/` |
| **Feature** | **Actions** | Each Action class executed end-to-end with real DB, real events, real side effects (no DB mocks) | Pest | In-memory SQLite | `src/Services/Actions/` |
| **Browser** | **UI (Nova)** | One file **per flow** in `final/process.md` *Ordered flow* | Pest + Dusk | Workbench SQLite file | final/process.md *Ordered flow* + `src/Nova/` |

**Strict layer assignment — no overlap:**
- Domain logic (model methods, VO immutability, enum transitions, schema) → **Unit only**
- Business operations (Action::handle, events, persistence, side queues, emails) → **Feature only**
- User-visible flow (fill forms, submit, open Actions, fill modals, submit, assert no error toast / success toast / redirect / row appears) → **Browser only**

A test belongs to exactly one suite.

### Locale-aware test config — APP_LOCALE forced

The base test environment must force the same locale operators see in production (and that debug + showcase use). Stale locale in test runs masks i18n drift.

- `phpunit.xml` and `phpunit.dusk.xml` must declare `<env name="APP_LOCALE" value="{locale}"/>`.
- `testbench.yaml` must declare the same `APP_LOCALE` under its `env:` section.
- The locale is the one written by `opscale-init` to `.specify/memory/constitution.md` (`**Workbench Locale:**`).

### Browser tests with Nova DevTool + Testbench Dusk

Browser tests run in a fundamentally different way than Unit/Feature tests:

1. **Testbench Dusk** starts a real PHP built-in server on a configurable port
2. The server serves the workbench app (with Nova, migrations, seeders)
3. **ChromeDriver** controls a real Chrome browser
4. The browser makes HTTP requests to the server
5. Tests interact with the page via Dusk's browser API

**Key implication:** The test process and the server process are SEPARATE. They share the same SQLite database file (from `workbench:build`), but NOT in-memory state. Data created with factories in the test process may not exist in the server process unless it's written to the shared SQLite file.

**Workbench build is REQUIRED before Browser tests:**

```bash
./vendor/bin/testbench workbench:build
```

**Nova assets — Dusk skeleton needs them.** The Dusk server uses its own skeleton at `vendor/orchestra/testbench-dusk/laravel/`. Nova assets (JS, CSS, mix-manifest.json) must exist in that skeleton's `public/vendor/nova/`. They are NOT automatically copied from the testbench-core skeleton. The `composer run build` script does the copy.

**View Cache must be cleared in both skeletons** after copying assets or changing providers. If `@inertia` shows as literal text in screenshots, the view cache is stale.

The full `phpunit.xml`, `phpunit.dusk.xml`, `tests/TestCase.php`, `tests/DuskTestCase.php`, `tests/Pest.php`, `testbench.yaml`, smoke-test examples, Nova Dusk selectors, troubleshooting (Dusk 500s, port conflicts, ChromeDriver mismatches), and the workbench `DatabaseSeeder.php` template live in `references/test-configs.md`.

### Composer scripts — REQUIRED per module

Every Opscale module/package must define `build` and `serve` composer scripts so any contributor (or CI) can recreate the Browser test environment without remembering the multi-step incantation. The complete `scripts` block (post-autoload-dump, clear, prepare, build, serve, lint, fix, refactor, analyse, test, test:unit, test:feature, test:browser, test:browser:visual, showcase, check), the matching `require-dev` test-stack dependencies + `config`/`repositories`, and the `package.json` mirror are in `references/test-configs.md` — copy them verbatim, substituting only the per-module Browser test filenames on the `test:browser*` / `showcase` lines.

Key design decisions:
- `composer run build` — recreates the entire test/workbench environment from a clean clone.
- `composer run serve` — runs Testbench's built-in PHP server with the workbench mounted (`http://localhost:8000/nova`).
- `test:browser` chains `build` so Browser tests always run against a freshly rebuilt workbench.
- **Browser tests have two modes** — keyed off `DUSK_HEADLESS`:
  - `composer run test:browser` — **headless** (CI default). `DUSK_HEADLESS=true DUSK_PAUSE_MS=0`. Fast.
  - `composer run test:browser:visual` — **visible browser**. `DUSK_HEADLESS=false DUSK_PAUSE_MS=3000`. 3-second pause via `Browser::submitForm()` macro.
- `test` runs Unit+Feature only (no ChromeDriver dependency for CI fast path).
- `check` is the full pipeline: fix → refactor → lint → analyse → test.
- `analyse` includes `--memory-limit=512M` to prevent OOM with strict-rules.

### macOS arm gotcha — ChromeDriver

On Apple Silicon, `testbench dusk:chrome-driver --detect` may create an empty directory at `vendor/laravel/dusk/bin/chromedriver-mac-arm64/` alongside the actual binary at `vendor/laravel/dusk/bin/chromedriver-mac-arm` (no suffix). Strip macOS quarantine (`xattr -dr com.apple.quarantine ...`) and `chmod 755` if you hit `Permission denied`.

### Event listener registration

When registering Action classes as event listeners, always specify the method explicitly:

```php
// WRONG — Laravel calls handle() with the event object, causing TypeError
Event::listen(SomeEvent::class, SomeAction::class);

// CORRECT — routes to the asListener() method
Event::listen(SomeEvent::class, [SomeAction::class, 'asListener']);
```

This is because `opscale-co/actions` uses `asListener()` for event handling, but Laravel's dispatcher defaults to calling `handle()` when given a class name.

### Domain Rules

1. **The skill configures, generates, AND validates** — configuration without generated tests is incomplete; generated tests that never ran are also incomplete. After configuring the stack and spawning generator agents, the skill must run the validation loop until `composer run test`, `composer run test:browser`, and `composer run check` all exit green.
2. **Strict layer assignment — no overlap:**
   - Unit → **Domain only**: Models, Enums, Value Objects, Repositories, Migrations/Schema.
   - Feature → **Actions only**: one test per class in `src/Services/Actions/`. Hits real DB, asserts events, asserts state. **No DB mocks.**
   - Browser → **flow journeys**: one test class per flow in `final/process.md` *Ordered flow*, one `#[Test]` method per path. Drives the full user journey through Nova. **No DB-level business asserts** — those stay in Feature tests.
3. **Browser tests use Nova DevTool + Testbench Dusk + Workbench** — `DuskTestCase` extends `Orchestra\Testbench\Dusk\TestCase` with `WithWorkbench`.
4. **Workbench seeders are mandatory** — `workbench/database/seeders/DatabaseSeeder.php` must seed: (a) `admin@laravel.com / password` for `loginToNova()`, and (b) 1–3 records per aggregate root.
5. **`composer run build` is the single environment-recreation command** — must work from a clean clone.
6. **`composer run serve` is mandatory** — runs `testbench serve` so any developer can browse the workbench Nova UI outside of Dusk.
7. **Browser tests have two modes** (headless CI / visual stakeholder). `DUSK_PAUSE_MS` is independently overridable. Pause is centralized in `submitForm()`. Every `submitForm()` must be immediately followed by `$browser->assertNoErrorToast()`.
8. **`test:browser` always rebuilds the workbench** — chains `composer run build` first.
9. **Browser tests run separately from `test` / `check`** — they require ChromeDriver.
10. **Login via browser form** — use the `loginToNova()` helper. Avoid `loginAs()`.
11. **PHPStan level 9** — all four `strict-rules` rule sets active.
12. **`declare(strict_types=1)`** enforced by Pint via `duster fix`.
13. **TLint compliance** — always use `use` imports, never `\Fully\Qualified\Class` in code.
14. **Event listeners must specify method** — `[Action::class, 'asListener']` not `Action::class`.
15. **`composer run check`** runs fix + refactor + lint + analyse + test — this is the CI entry point.
16. **Locale forced in test config** — `phpunit.xml`, `phpunit.dusk.xml`, and `testbench.yaml` all carry `APP_LOCALE={locale}` from the constitution.

## Steps

### Phase 1 — Verify prerequisites

Confirm the constitution exists, `composer.json` is present, and identify which source directories are populated (Models, Actions, Nova, process.md). The test suites you can generate depend on which source layers exist.

Decide whether this run is **stack-only** (configure now, generate when source appears later) or **full** (configure + generate). For new modules, full is recommended.

**Wait for user approval before continuing.**

### Phase 2 — Install test dependencies

**Confirm with the user BEFORE installing** which packages are required for the project type (full Nova + Dusk + strict-rules, or a leaner library stack). Once approved:

```bash
# Pest must allow its plugin — do this FIRST
composer config allow-plugins.pestphp/pest-plugin true

# Testing
composer require pestphp/pest pestphp/pest-plugin-laravel --dev --with-all-dependencies
composer require orchestra/testbench-dusk --dev
composer require mockery/mockery --dev

# Nova DevTool (usually already present in Nova packages)
composer require laravel/nova-devtool --dev

# Static analysis
composer require larastan/larastan --dev
composer require opscale-co/strict-rules --dev

# Linting & modernization
composer require tightenco/duster --dev
composer require rector/rector --dev
```

**ChromeDriver:** install matching the local Chrome major version:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --version
./vendor/bin/testbench dusk:chrome-driver 146   # replace 146 with your Chrome major
```

ChromeDriver version must match installed Chrome exactly. If Chrome auto-updates, re-run. macOS arm gotcha (see Context) applies.

**Wait for user approval before continuing.**

### Phase 3 — Publish config files (locale forced everywhere)

Copy the verbatim configs from `references/test-configs.md`:

- `phpunit.xml` — Unit + Feature + Browser suites. **must declare `<env name="APP_LOCALE" value="{locale}"/>`** (read locale from `.specify/memory/constitution.md`).
- `phpunit.dusk.xml` — Browser suite only (minimal env). **must declare `<env name="APP_LOCALE" value="{locale}"/>`** so Dusk runs match the showcase / production locale.
- `testbench.yaml` — provider list for Nova + Dusk. **must declare `env: APP_LOCALE: {locale}`** under its `env:` section.
- `tests/TestCase.php` — base for Unit + Feature (Orchestra Testbench).
- `tests/DuskTestCase.php` — base for Browser (Orchestra Testbench Dusk, headless-by-default driver() override, pauseMs() + isHeadless() helpers, `Browser::submitForm()` + `Browser::assertNoErrorToast()` macros registered in setUp()).
- `tests/Pest.php` — bootstraps TestCase for Unit + Feature only.
- `phpstan.neon` — level 9 with all four strict-rules sets.
- `duster.json` + `pint.json` — `declare_strict_types`, phpstan disabled in lint/fix.
- `rector.php` — PHP 8.2+, Laravel-specific, PHPUnit-to-attributes, code quality.

**Wait for user approval before continuing.**

### Phase 4 — Generate the workbench seeder

Browser tests run against the **workbench** (Nova DevTool skeleton). Since flow tests start from a real detail/list page (or trigger Actions on existing records), they need at least one persisted record per Resource. **A minimal seeder per aggregate root is REQUIRED.**

Generate `workbench/database/seeders/DatabaseSeeder.php` with:
- the `admin@laravel.com / password` user (hardcoded by `loginToNova()`)
- one factory call per aggregate root (1–3 records each)

Template lives in `references/test-configs.md` (note: the richer `opscale-seed` skill exists for the Presentation-phase demo seeder; this Phase 4 seeder is the minimal test fixture).

**Wait for user approval before continuing.**

### Phase 5 — Spawn generator agents (per layer — each layer is its own sub-gate)

The skill walks `src/` and spawns generator agents in parallel to produce the test files. Each layer is its own sub-gate — confirm with the user after each before proceeding to the next.

**Generation walk:**

| Source directory | Agent | Suite |
|------------------|-------|-------|
| `src/Models/*.php` (non-enum, non-VO) | `unit-test-generator` (type=model) | Unit |
| `src/Models/Enums/*.php` | `unit-test-generator` (type=enum) | Unit |
| `src/Models/ValueObjects/*.php` | `unit-test-generator` (type=value_object) | Unit |
| `src/Models/Repositories/*.php` | `unit-test-generator` (type=repository) | Unit |
| `database/migrations/*.php` | `unit-test-generator` (type=migration) | Unit |
| `src/Services/Actions/*.php` | `feature-test-generator` | Feature |
| final/process.md *Ordered flow* (driving the `src/Nova/` screens) | `web-test-generator` | Browser |

**5a. Unit layer** — spawn all `unit-test-generator` agents in parallel. **Sub-gate: confirm before proceeding.**

**5b. Feature layer** — spawn all `feature-test-generator` agents in parallel. **Sub-gate: confirm before proceeding.**

**5c. Browser layer** — spawn `web-test-generator` agents, one per flow in `final/process.md` *Ordered flow*. **Sub-gate: confirm before proceeding.**

**What each agent produces:**

- **`unit-test-generator`** → `tests/Unit/{Type}/{Name}Test.php` files testing domain in isolation (no Action calls, no Nova).
- **`feature-test-generator`** → one `tests/Feature/{ActionName}Test.php` per Action, calling `Action::run()` against real DB, asserting events dispatched and state persisted.
- **`web-test-generator`** → one `tests/Browser/{Flow}FlowTest.php` per flow with one `#[Test]` method per path (happy + each gateway branch + each UI-visible failure). Each method drives the full user journey through Nova via `loginToNova()`, `submitForm()`, `assertNoErrorToast()`.

**Do NOT generate cross-suite tests** — no Feature test for a model, no Unit test for an Action, no Browser test with business asserts.

**Wait for user approval before continuing.**

### Phase 6 — Validation loop (MANDATORY)

Generating test files is not enough. Each suite must actually execute and pass before the skill exits. Run this loop until all three suites are green:

```
1. composer run build          # recreate workbench, copy Nova assets, sync ChromeDriver
2. composer run test            # Unit + Feature suites
   on failure: read the Pest output, fix the offending test file
   (or the source it tests if the source is wrong), re-run. Repeat until green.
3. composer run test:browser    # Browser suite against Nova DevTool workbench
   on failure: inspect tests/Browser/screenshots/ + tests/Browser/console/,
   fix selectors / waits / seed data / Resource code, re-run. Repeat until green.
4. composer run check           # full pipeline: fix -> refactor -> lint -> analyse -> test
   on failure: address the reported issues, re-run. Repeat until green.
```

**Stop conditions for the loop:**
- Exit when all three commands (`test`, `test:browser`, `check`) exit 0 on a clean re-run.
- Do NOT mark the skill complete with red tests "to be fixed later". A skipped suite is a failed skill.
- If a Browser test fails for an environmental reason (ChromeDriver version, port collision) fix the environment per Troubleshooting in `references/test-configs.md`, then resume the loop.

**Wait for user approval before continuing.**

### Phase 7 — Final approval (visual smoke offered)

After the headless loop is green, prompt the user once:

> Browser suite green. Run `composer run test:browser:visual` now to watch a flow end-to-end? Recommended at least once per module to confirm the 3-second pauses and visual fidelity match what stakeholders will see.

This is NOT part of the auto-loop (a visible Chrome window cannot run in CI). It is a one-time fidelity check before declaring the skill complete.

**Completeness checklist** (verify before declaring done):

```
TEST CONFIGURATION + GENERATION GATE
[ ] Pest + pest-plugin-laravel installed; allow-plugins set
[ ] Orchestra Testbench Dusk + mockery installed
[ ] tests/TestCase.php, tests/DuskTestCase.php, tests/Pest.php created
[ ] phpunit.xml, phpunit.dusk.xml, testbench.yaml all carry APP_LOCALE={locale}
[ ] ChromeDriver matches local Chrome major version
[ ] workbench/database/seeders/DatabaseSeeder.php created (admin + per-aggregate factories)
[ ] composer run build + composer run serve work from a clean clone
[ ] Unit test per Model / Enum / VO / Repository / migration
[ ] Feature test per Action (real DB, real events)
[ ] One Browser flow test per Ordered flow subprocess
[ ] Every Browser test uses loginToNova(), submitForm(), assertNoErrorToast()
[ ] No raw ->pause() calls in Browser tests; no DB-level business asserts in Browser tests
[ ] PHPStan level 9, all strict-rules, --memory-limit=512M, passes clean
[ ] duster.json, pint.json, rector.php in place; Duster lint passes clean
[ ] composer scripts: build, serve, lint, fix, refactor, analyse, test, test:unit, test:feature, test:browser, test:browser:visual, check
[ ] package.json mirrors composer scripts
[ ] composer run test, test:browser, check all exit 0 on a clean re-run
[ ] Visual smoke offered to user
```

**Wait for user approval before continuing.**

## Sample

`phpunit.dusk.xml` + Feature test + composer scripts excerpt — see `references/sample-output.md`.

## Success condition

```bash
node scripts/validate-test.mjs --project-root=.
```

Exit code 0 = pass.
