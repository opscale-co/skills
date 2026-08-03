---
name: opscale-showcase
description: >
  Generates a non-headless guided Dusk walkthrough that drives each of the
  module's processes end to end through Nova, pausing 3s before the main action
  on each screen so a stakeholder can watch the whole module work. Step 13 —
  final Presentation step, runs after opscale-menu. Trigger: "showcase the
  module", "demo Nova", "guided walkthrough". Use it whenever a guided visual
  Nova demo of the module is wanted, even loosely phrased. Not for CI smoke
  tests (opscale-test) or the menu (opscale-menu).
---

# opscale-showcase

## Context

### Purpose — why this skill exists

The showcase runs on the **Nova DevTool + Testbench Dusk** stack configured by `opscale-test` (Nova DevTool ships the workbench skeleton that Dusk drives, and `DuskTestCase` extends `Orchestra\Testbench\Dusk\TestCase` with `WithWorkbench`). This skill reuses that infrastructure with a non-headless driver override.

Smoke Browser tests (one per Resource, headless, fast) verify that nothing crashes — but they're invisible. A stakeholder watching CI never sees the package. The "showcase" pattern was invented during the Teller flow and proved its value:

- One visible Chrome session
- A human watches the module **work**: each process driven end to end, not a tour of empty tables
- Pauses 3s before the main action on every screen so the viewer can read it
- Ends with the module having done something real

It's the single most persuasive artifact for "is this module done".

This skill is **Step 3 (final) of the Presentation phase**. Seed populated the workbench, menu organized navigation, and showcase now produces the single visual artifact that exercises both: a guided non-headless walkthrough that a stakeholder can sit and watch.

### Prerequisites

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | `opscale-ui` has been run | `src/Nova/*.php` populated | Stop. Run `/opscale-ui` — there's nothing to walk. |
| 3 | `opscale-seed` has been run (Presentation #1) | The seed lets each process be walked end to end | Run `/opscale-seed` first. |
| 3b | `docs/plan/process.txt` has subprocess blocks | Read `docs/plan/process.txt` | Run `/opscale-process` — the showcase walks the processes. |
| 4 | `opscale-menu` has been run (Presentation #2) | `MenuSection` block present in `workbench/app/Providers/NovaServiceProvider.php` | Run `/opscale-menu` first. |
| 5 | `opscale-test` Dusk infrastructure is set up | `tests/DuskTestCase.php` + `phpunit.dusk.xml` exist | Run `/opscale-test` first. |
| 6 | ChromeDriver matches local Chrome major version | `vendor/bin/testbench dusk:chrome-driver --detect` | Re-run with explicit version. On macOS arm the binary lives at `vendor/laravel/dusk/bin/chromedriver-mac-arm` (no `-arm64` suffix). |

### Output

Writes **`tests/Browser/{Module}ShowcaseTest.php`** with:

- `final class {Module}ShowcaseTest extends DuskTestCase`
- Override of `driver()` that **ignores** `DUSK_HEADLESS` — the showcase is always visible
- One `#[Test]` method `guided_walkthrough_of_full_{module}_flow`
- A `MAIN_BUTTON_PAUSE_MS` constant defaulting to `3000`
- Steps: login (3s pause before Log In) → dashboard → then **drive each process in `docs/plan/process.txt` subprocesses end to end** (reuse the per-process flows from `opscale-test`), pausing 3s before the main action on each screen

### Template

```php
<?php

declare(strict_types=1);

namespace {PackageNamespace}\Tests\Browser;

use Facebook\WebDriver\Chrome\ChromeOptions;
use Facebook\WebDriver\Remote\DesiredCapabilities;
use Facebook\WebDriver\Remote\RemoteWebDriver;
use Laravel\Dusk\Browser;
use Override;
use PHPUnit\Framework\Attributes\Test;
use {PackageNamespace}\Tests\DuskTestCase;

/**
 * Special non-headless guided walkthrough of the full {Module} module.
 */
final class {Module}ShowcaseTest extends DuskTestCase
{
    /** Pause before clicking the primary button of each screen. */
    private const MAIN_BUTTON_PAUSE_MS = 3000;

    #[Override]
    protected function driver(): RemoteWebDriver
    {
        $options = (new ChromeOptions())->addArguments([
            '--window-size=1920,1080',
            '--disable-search-engine-choice-screen',
            '--disable-smooth-scrolling',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            // INTENTIONALLY no --headless flag here — this is the showcase test.
        ]);

        return RemoteWebDriver::create(
            $_ENV['DUSK_DRIVER_URL'] ?? env('DUSK_DRIVER_URL') ?? 'http://localhost:9515',
            DesiredCapabilities::chrome()->setCapability(ChromeOptions::CAPABILITY, $options)
        );
    }

    #[Test]
    final public function guided_walkthrough_of_full_{module}_flow(): void
    {
        $this->browse(function (Browser $browser): void {
            // --- 1. Login screen ---
            $browser->visit('/nova')
                ->waitFor('input[name="email"]', 15)
                ->type('email', 'admin@laravel.com')
                ->type('password', 'password')
                ->pause(self::MAIN_BUTTON_PAUSE_MS)
                ->press('Log In')
                ->waitForText('Get Started', 30);

            // --- 2. Dashboard ---
            $browser->visit('/nova/dashboards/main')
                ->pause(self::MAIN_BUTTON_PAUSE_MS);

            // --- 3. Drive each identified process end to end ---
            // For each process in docs/plan/process.txt, reuse its
            // per-process flow from opscale-test and pause 3s before the main
            // action on each screen.

            // --- 4. Seeded record detail (uses a known seeded reference) ---

            // --- 5. Create form for the headline aggregate ---
            $browser->visit('/nova/resources/{primary-uri}/new')
                ->pause(self::MAIN_BUTTON_PAUSE_MS)
                ->assertDontSee('SERVER ERROR')
                ->assertDontSee('Whoops');
        });

        $this->assertTrue(true, 'Guided walkthrough completed.');
    }
}
```

### `composer showcase` command

The showcase is invoked on demand, not as part of `composer run test:browser`. Register a **`showcase`** script in `composer.json` (and mirror it in `package.json`). This is the single command anyone runs to play the guided walkthrough.

**`composer.json`** — add to `scripts`:

```json
{
    "scripts": {
        "showcase": [
            "@composer build",
            "@php vendor/bin/pest tests/Browser/{Module}ShowcaseTest.php -c phpunit.dusk.xml"
        ]
    }
}
```

**`package.json`** — mirror:

```json
{
    "scripts": {
        "showcase": "composer run showcase"
    }
}
```

**Why chain `@composer build` first:** the showcase runs against the workbench skeleton. If assets, SQLite DB or ChromeDriver drifted, the walkthrough fails on a blank page or 500. `build` rebuilds the workbench from scratch so a clean clone can run `composer run showcase` and watch the module work. Never document or recommend the raw `vendor/bin/pest …` form — it skips `build` and breaks on fresh clones.

### Domain Rules

1. **Always non-headless** — the override of `driver()` removes `--headless`. Re-add the flag and the test reverts to a smoke that has no human audience.
2. **3-second pause as default, configurable** — `MAIN_BUTTON_PAUSE_MS = 3000`. Faster pauses break the "human can read it" guarantee. Slower pauses make the showcase tedious. 3000 was empirically right for the Teller demo (47 assertions in ~94s).
3. **Walk menu order, not alphabetical** — the showcase mirrors how an operator would navigate. If `opscale-menu` ran, use its order.
4. **End on a create form** — the showcase's closing shot is "what would the operator do here?". Never end on an index page.
5. **One test method per module** — don't split the walkthrough into many methods. The whole point is the single uninterrupted reel.
6. **Invoked via `composer run showcase`** — registered as its own composer script (chained with `@composer build` so it always runs against a fresh workbench). NOT included in the default `composer run test:browser` suite.
7. **Depends on seeded data** — the detail page step relies on `opscale-seed`. Missing records → blank detail pages → the showcase loses its punch.
8. **Runs on Nova DevTool + Testbench Dusk** — same workbench skeleton as `opscale-test` Browser suite; only the `driver()` override differs (no `--headless`).
9. **Validation is mandatory** — the showcase must actually run green before the skill exits. Writing the file without running it defeats the whole purpose.

## Steps

### Phase 1 — Verify prerequisites

Confirm all 6 prerequisites listed in Context. Inspect:
- `src/Nova/*.php` (Resources exist)
- `workbench/database/seeders/DatabaseSeeder.php` (seed runs end-to-end per process)
- `docs/plan/process.txt` subprocesses (process inventory)
- `workbench/app/Providers/NovaServiceProvider.php` (menu block present)
- `tests/DuskTestCase.php` + `phpunit.dusk.xml`
- ChromeDriver version matches local Chrome

If any prerequisite is missing, stop and direct the user back to the appropriate skill.

**Wait for user approval before continuing.**

### Phase 2 — Inventory processes from BPMN

Read `docs/plan/process.txt` — one walkthrough segment per subprocess, in flow order. For each:

- Reuse the steps from its `tests/Browser/{Process}FlowTest` (generated by `opscale-test`) so the showcase drives the same flow, only non-headless and with a 3s pause before each main action.
- Resolve each Resource `uriKey()` via reflection (kebab-case URI segment, not the class name).

Identify the **headline aggregate** (the one with the most HasMany children — Teller's is `CashTransaction`, Loans' would be `LoanApplication`). The headline aggregate provides:
- the "seeded detail" record (look at `DatabaseSeeder.php` for a stable identifier like `reference_number => 'TX-DEMO-0001'`; otherwise pick the first record via `Model::query()->first()`).
- the "create form" target — the showcase's closing shot.

Present the planned walkthrough to the user:

```
Showcase outline:
  1. Login (3s pause before Log In)
  2. Dashboard (3s pause)
  3. Process [A]:
       - visit /nova/resources/{uri-a} -> pause 3s -> [action]
       - ...
  4. Process [B]: ...
  5. Seeded detail: {Model} #{reference}
  6. Create form: /nova/resources/{primary-uri}/new
```

**Wait for user approval before continuing.**

### Phase 3 — Generate ShowcaseTest per process

Render the template with:
- `{PackageNamespace}` resolved from `composer.json` PSR-4
- `{Module}` derived from the namespace's last segment (e.g. `Teller`)
- `{module}` lowercase for the method name (e.g. `teller`)
- One walkthrough segment per process.txt subprocess
- Seeded record block populated from Phase 2
- `{primary-uri}` from the headline aggregate

Write to `tests/Browser/{Module}ShowcaseTest.php`.

Register the `composer showcase` command (and the `package.json` mirror) per Context → `composer showcase` command. The script MUST chain `@composer build` before running pest against `phpunit.dusk.xml`.

**Wait for user approval before continuing.**

### Phase 4 — Validation loop (Dusk passes in visible Chrome)

The showcase is not complete the moment the file is written. It must actually execute end to end against the Nova DevTool workbench. Run this loop until the walkthrough exits green:

```
1. php -l tests/Browser/{Module}ShowcaseTest.php
   on syntax error: fix the template rendering, re-run.

2. composer run showcase
   chains `composer run build` (rebuilds the Nova DevTool workbench, syncs
   ChromeDriver, copies assets) and then runs the showcase test.
   on failure: inspect tests/Browser/screenshots/ + tests/Browser/console/.
   Typical fixes:
     - selector drift     -> update the visit()/click()/waitFor() target
     - timing flake       -> raise the waitFor timeout or add a pause
     - missing seed data  -> fix workbench/database/seeders/DatabaseSeeder.php
     - 500 on a screen    -> fix the Nova Resource the process touches
   Re-run `composer run showcase`. Repeat until it exits 0.
```

**Stop conditions:**
- Exit when `composer run showcase` exits 0 on a clean re-run.
- Do NOT mark the skill complete with a red or skipped showcase. A showcase that "should work but didn't run" is a failed skill — the whole point is the uninterrupted reel actually running.

The showcase is invoked on demand via `composer run showcase` — it is NOT included in the default `composer run test:browser` suite. CI runs the smoke ResourceTests (headless) for gating; the showcase is for stakeholders.

**Wait for user approval before continuing.**

## Sample

`ShowcaseTest` excerpt with 3s pause pattern — see `references/sample-output.md`.

## Success condition

```bash
composer showcase
```

Exit code 0 = pass.
