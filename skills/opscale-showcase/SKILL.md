---
name: opscale-showcase
description: >
  Generates a non-headless guided Dusk walkthrough of the workbench Nova flow.
  Step 13 — final Presentation step, runs after opscale-menu. Trigger:
  "showcase the module", "demo Nova", "guided walkthrough".
  Use it whenever a guided visual Nova walkthrough/demo is wanted, even loosely phrased. Not for CI smoke tests (opscale-test) or the menu (opscale-menu).
---

# opscale-showcase

## Prerequisites

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | `opscale-ui` has been run | `src/Nova/*.php` populated | Stop. Run `/opscale-ui` — there's nothing to walk. |
| 3 | `opscale-seed` has been run (Presentation #1) | At least one record per aggregate root in the workbench sqlite | Run `/opscale-seed` first — detail pages need seeded records to render. |
| 4 | `opscale-menu` has been run (Presentation #2) | `MenuSection` block present in `workbench/app/Providers/NovaServiceProvider.php` | Run `/opscale-menu` first — the showcase walks the operator-grouped sidebar, not the flat default. |
| 5 | `opscale-test` Dusk infrastructure is set up | `tests/DuskTestCase.php` + `phpunit.dusk.xml` exist | Run `/opscale-test` first. |
| 6 | ChromeDriver matches local Chrome major version | `vendor/bin/testbench dusk:chrome-driver --detect` | Re-run with explicit version (`dusk:chrome-driver {major}`). On macOS arm the binary lives at `vendor/laravel/dusk/bin/chromedriver-mac-arm` (no `-arm64` suffix). |

This skill is **Step 3 (final) of the Presentation phase**. Seed populated the
workbench, menu organized navigation, and showcase now produces the single
visual artifact that exercises both: a guided non-headless walkthrough that a
stakeholder can sit and watch. When showcase passes, the module is demoable.

## Why this skill exists

Smoke Browser tests (one per Resource, headless, fast) verify that nothing
crashes — but they're invisible. A stakeholder watching CI never sees the
package. The "showcase" pattern was invented during the Teller flow and
proved its value:

- One visible Chrome session
- A human can watch login → dashboard → every aggregate
- Pauses long enough to read what's on each screen
- Closes with a final create-form so the demo ends in "what can I do next?"

It's the single most persuasive artifact for "is this module done".

## Output

Writes **`tests/Browser/{Module}ShowcaseTest.php`** with:

- `final class {Module}ShowcaseTest extends DuskTestCase`
- Override of `driver()` that **ignores** `DUSK_HEADLESS` — the showcase is
  always visible
- One `#[Test]` method `guided_walkthrough_of_full_{module}_flow`
- A `MAIN_BUTTON_PAUSE_MS` constant defaulting to `3000`
- Steps: login (3s pause before Log In) → dashboard → every aggregate Resource
  index → seeded detail page → create form

## Template

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
 *
 * Always runs with a visible Chrome window (overrides DuskTestCase::driver()
 * to ignore DUSK_HEADLESS). Pauses 3000ms before pressing the main button on
 * each screen so a human reviewer can watch the navigation, confirm the menu,
 * and see every aggregate resource render against seeded workbench data.
 *
 * Run with:
 *
 *     vendor/bin/pest tests/Browser/{Module}ShowcaseTest.php -c phpunit.dusk.xml
 */
final class {Module}ShowcaseTest extends DuskTestCase
{
    /** Pause before clicking the primary button of each screen. */
    private const MAIN_BUTTON_PAUSE_MS = 3000;

    /**
     * Force a NON-headless Chrome regardless of DUSK_HEADLESS — the showcase
     * is the human-observable validation pass.
     */
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

            // --- 3. Walk every aggregate Resource in menu order ---
            $resources = [
                // {one entry per uriKey() from src/Nova/*.php, in MENU order}
                'agency-operating-days',
                'cash-transactions',
                // ...
            ];

            foreach ($resources as $uri) {
                $browser->visit('/nova/resources/'.$uri)
                    ->pause(self::MAIN_BUTTON_PAUSE_MS)
                    ->assertDontSee('SERVER ERROR')
                    ->assertDontSee('Whoops')
                    ->assertDontSee('Exception');
            }

            // --- 4. Seeded record detail (uses a known seeded reference) ---
            // {one record fetched via Model::query()->where(...)->first()}
            // {then ->visit('/nova/resources/{uri}/'.$record->getKey())}

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

## Workflow

### Step 1 — Discover the aggregate URIs in menu order

Read `workbench/app/Providers/NovaServiceProvider.php` if it has a
`mainMenu(...)` call (generated by `opscale-menu`) and walk that order.
Otherwise reflect over `src/Nova/*.php`, skipping Resources whose
`availableForNavigation()` returns `false`, and use alphabetical order.

Resolve the `uriKey()` of each Resource via reflection — the showcase needs
the kebab-case URI segment, not the class name.

### Step 2 — Pick a "seeded detail" record

Look at `workbench/database/seeders/DatabaseSeeder.php`. If it uses a stable
identifier (e.g. `reference_number => 'TX-DEMO-0001'`), reference that.
Otherwise pick the first record of the headline aggregate:

```php
$record = \{PackageNamespace}\Models\{HeadlineModel}::query()->first();
```

The headline aggregate is the one with the most HasMany children — Teller's
is `CashTransaction`, Loans' would be `LoanApplication`, etc.

### Step 3 — Pick a "create form" target

The same headline aggregate. The create form is the showcase's closing
shot — "what can the operator do here?".

### Step 4 — Render and write

Render the template with:
- `{PackageNamespace}` resolved from `composer.json` PSR-4
- `{Module}` derived from the namespace's last segment (e.g. `Teller`)
- `{module}` lowercase for the method name (e.g. `teller`)
- `resources[]` populated from Step 1
- Seeded record block populated from Step 2
- `{primary-uri}` from Step 3

Write to `tests/Browser/{Module}ShowcaseTest.php`.

### Step 5 — Smoke gate

The showcase is the smoke gate. Run it once headless to validate the
walkthrough doesn't crash:

```bash
# First, ensure the test parses
php -l tests/Browser/{Module}ShowcaseTest.php

# Then, with the workbench freshly built and chromedriver running,
# run the showcase ONCE in headless mode for CI validation
DUSK_HEADLESS=true vendor/bin/pest tests/Browser/{Module}ShowcaseTest.php -c phpunit.dusk.xml
```

If headless passes, the visible version will too. The visible run is what
the stakeholder watches; the headless run is what CI gates on.

Note: `DUSK_HEADLESS=true` is **ignored** by this test's overridden `driver()`
during normal invocation — but for the smoke-gate CI run, you can either
accept the visible window in CI or temporarily comment the override. The
recommended CI behavior is to NOT include the showcase test in the default
`composer run test:web` suite; run it on demand with:

```bash
vendor/bin/pest tests/Browser/{Module}ShowcaseTest.php -c phpunit.dusk.xml
```

## Domain Rules

1. **Always non-headless** — the override of `driver()` removes `--headless`.
   This is the whole point. Re-add the flag and the test reverts to a smoke
   that has no human audience.
2. **3-second pause as default, configurable** — `MAIN_BUTTON_PAUSE_MS = 3000`.
   Faster pauses break the "human can read it" guarantee. Slower pauses make
   the showcase tedious. 3000 was empirically right for the Teller demo (47
   assertions in ~94s).
3. **Walk menu order, not alphabetical** — the showcase mirrors how an
   operator would navigate. If `opscale-menu` ran, use its order.
4. **End on a create form** — the showcase's closing shot is "what would the
   operator do here?". Never end on an index page.
5. **One test method per module** — don't split the walkthrough into many
   methods. The whole point is the single uninterrupted reel.
6. **Not in the default test suite** — `composer run test:web` does NOT
   include the showcase by default; it's invoked on demand. CI runs the
   smoke ResourceTests (headless) for gating; the showcase is for
   stakeholders.
7. **Depends on seeded data** — the detail page step relies on
   `opscale-seed` (or equivalent). Missing records → blank detail pages →
   the showcase loses its punch.
