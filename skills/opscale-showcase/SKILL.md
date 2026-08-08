---
name: opscale-showcase
description: >
  The Presentation phase — the module made presentable and demoable after
  Generate and Review. Seeds a connected demo dataset, builds a process-driven
  Nova menu, and runs a non-headless guided Dusk walkthrough that drives each
  process end to end (3s pause before each main action). Trigger: "showcase the
  module", "demo Nova", "guided walkthrough", "seed demo data", "generate the
  menu", "fix empty Nova pages", "organize the sidebar". Not for per-layer
  tests (domain/logic/ui) or production data.
---

# opscale-showcase

## Context

### Purpose — why this skill exists

Once a module is generated and reviewed, three things stand between it and a
stakeholder demo: the Nova pages are empty, the sidebar is an alphabetical wall
of Resources, and nothing drives the module so a viewer can watch it work. This
skill — the **single Presentation-phase skill** — closes all three, in order:

1. **Seed demo data** — a coherent, connected dataset that exemplifies a
   complete run of each process (not isolated rows). It is the script the
   walkthrough follows and it also surfaces Resource bugs that empty pages hide.
2. **Nova menu** — a process-driven sidebar grouped the way an operator works
   (open the day → run operations → control → close), aggregate roots only.
3. **Guided walkthrough** — one visible Chrome session that drives each process
   end to end through Nova, pausing 3s before the main action on every screen so
   a stakeholder can sit and watch the whole module work.

The "showcase" pattern proved its value during the Teller flow: a single
non-headless reel is the most persuasive artifact for "is this module done".
Smoke Browser tests (headless, one per Resource) verify nothing crashes — but
they are invisible; nobody watching CI ever sees the module. This skill produces
the visible artifact that exercises the seed and the menu together.

This skill absorbs what were once `opscale-seed` and `opscale-menu`; their
contracts now live in `references/seeder.md` and `references/menu.md`.

### Prerequisites

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | `opscale-domain` has been run | `src/Models/` populated; `workbench/database/factories/` present | Stop. Run `/opscale-domain` — nothing to seed. |
| 3 | `opscale-ui` has been run | `src/Nova/*.php` populated; `tests/Browser/*FlowTest.php` present | Stop. Run `/opscale-ui` — there's nothing to walk. |
| 4 | Dusk harness from `opscale-init` is set up | `tests/DuskTestCase.php` + `phpunit.dusk.xml` exist; `showcase` script in `composer.json` | Re-run `/opscale-init` — it stands up the dev/test/debug environment and registers the `showcase` script. |
| 5 | `docs/plan/process.txt` has subprocess blocks | Read `docs/plan/process.txt` | Run `/opscale-process` — the seed and walkthrough are organized by process. |
| 6 | Workbench User model exists | `workbench/app/Models/User.php` | Restore from a sibling module or create the standard testbench User model. |
| 7 | ChromeDriver matches local Chrome major version | `vendor/bin/testbench dusk:chrome-driver --detect` | Re-run with explicit version. On macOS arm the binary lives at `vendor/laravel/dusk/bin/chromedriver-mac-arm` (no `-arm64` suffix). |

### Output

Three artifacts, one per phase group:

| Phase group | Artifact | Contract |
|-------------|----------|----------|
| A — Seed | `workbench/database/seeders/DatabaseSeeder.php` (demo block between `opscale-seed` markers) | `references/seeder.md` |
| B — Menu | `workbench/app/Providers/NovaServiceProvider.php` (`Nova::mainMenu()` between `opscale-menu` markers) | `references/menu.md` |
| C — Walkthrough | `tests/Browser/{Module}ShowcaseTest.php` + `showcase` composer script | this SKILL body |

The seed and menu blocks live between idempotent markers so re-runs replace the
generated block and preserve custom code around it. The markers keep the
historical `opscale-seed` / `opscale-menu` prefixes so a re-run replaces the
block in modules generated before the merge.

### Walkthrough template

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
            // --- 1. Login screen (3s pause before Log In) ---
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

            // --- 3. Drive each process in docs/plan/process.txt end to end ---
            // Reuse each subprocess's flow from tests/Browser/{Process}FlowTest
            // (authored by opscale-ui); pause 3s before the main action on
            // every screen.

            // --- 4. Seeded record detail (a known seeded reference) ---

            // --- 5. Create form for the headline aggregate — closing shot ---
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

The showcase is invoked on demand, not as part of `composer run test:browser`.
`opscale-init` registers a `showcase` script in `composer.json` (mirrored in
`package.json`). This is the single command anyone runs to play the walkthrough:

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

Chaining `@composer build` first rebuilds the Nova DevTool workbench from scratch
(assets, SQLite DB, ChromeDriver) so a clean clone can run `composer run
showcase` and watch the module work. If the `showcase` script is absent, add it;
never recommend the raw `vendor/bin/pest …` form — it skips `build` and breaks on
fresh clones.

### Domain Rules

1. **Three artifacts, one skill** — the Presentation phase is done only when the
   seed, the menu, and the walkthrough all exist and cohere. A green walkthrough
   depends on the seed (empty pages → blank detail → the demo loses its punch)
   and follows the menu order.
2. **Walkthrough is always non-headless** — the `driver()` override removes
   `--headless`. Re-add the flag and the test reverts to a smoke with no human
   audience.
3. **3-second pause as default, configurable** — `MAIN_BUTTON_PAUSE_MS = 3000`.
   Faster breaks the "human can read it" guarantee; slower makes it tedious.
   3000 was empirically right for the Teller demo (47 assertions in ~94s).
4. **Walk menu order, not alphabetical** — the walkthrough mirrors how an
   operator navigates; end on a create form ("what would the operator do here?"),
   never on an index page.
5. **One test method per module** — the whole point is a single uninterrupted
   reel; do not split it into many methods.
6. **Idempotent generated blocks** — the seed and menu blocks live between their
   markers; re-runs replace the block and never duplicate. Anything outside the
   markers survives.
7. **Validation is mandatory** — the walkthrough must actually run green in
   visible Chrome before the skill exits. A showcase that "should work but
   didn't run" is a failed skill.

## Steps

### Phase group A — Seed demo data

Full contract, seeding order, template, and rules: **`references/seeder.md`**.

1. **Inventory aggregate roots + flows.** Read `src/Models/` and
   `src/Models/Enums/`; build the topological FK order. Identify catalog tables
   (no FKs + `is_active`) and aggregate roots. Cross-reference
   `docs/plan/process.txt` — each subprocess needs an end-to-end walkable
   dataset. Present the planned order and the flows covered.
2. **Propose the connected dataset.** For each flow, list the connected chain of
   records (trigger → each step's record with its FK back → final resolved
   outcome) and the catalog defaults. If a stakeholder reviewing the plan can't
   recognize the business scenario, refine until they can.
3. **Fill the demo block.** Render the seeder into
   `workbench/database/seeders/DatabaseSeeder.php` between the
   `// >>> opscale-seed:start` / `// <<< opscale-seed:end` markers, reusing the
   skeleton and factories `opscale-domain` left. Real model + enum imports, real
   catalog defaults, resolved states. Preserve anything outside the markers.
4. **Verify** per `references/seeder.md` (migrate:fresh --seed against sqlite;
   confirm ≥1 record per aggregate and each subprocess walkable end to end).

**Wait for user approval before continuing.**

### Phase group B — Nova menu

Full contract, grouping heuristic, template, and rules: **`references/menu.md`**.

1. **Inventory aggregate roots** in `src/Nova/`, filtering to
   `$displayInNavigation !== false` (child aggregates are tabs of their root, not
   sidebar entries). Read any `MENU_SECTION` / `MENU_ICON` / `MENU_ORDER`
   constants via reflection.
2. **Propose the menu structure.** Group the roots by process (from
   `docs/plan/process.txt`) in operator-work order — or the fallback heuristic
   when the spec gives no process info. Confirm section order, icons, and
   per-section item order.
3. **Generate the menu block** inside `workbench/app/Providers/NovaServiceProvider.php`
   between `// >>> opscale-menu:start` / `// <<< opscale-menu:end`, after
   `parent::boot()`. `Nova::mainMenu()` with one `MenuSection` per group, every
   label through `__()`. Insert `use` statements alphabetically; replace any
   previous marker block (idempotent).
4. **Verify** per `references/menu.md` (`php -l`, `dump-autoload`,
   `package:discover`; boot the workbench and confirm sections render in order,
   empty sections and children absent).

**Wait for user approval before continuing.**

### Phase group C — Guided walkthrough

1. **Inventory processes.** Read `docs/plan/process.txt` — one walkthrough
   segment per subprocess, in flow order. For each, reuse the steps from its
   `tests/Browser/{Process}FlowTest` (authored by `opscale-ui`) so the showcase
   drives the same flow, only non-headless and with a 3s pause before each main
   action. Resolve each Resource `uriKey()` via reflection (kebab-case URI
   segment, not the class name). Identify the **headline aggregate** (most
   HasMany children) — it provides the "seeded detail" record (a stable
   identifier from `DatabaseSeeder.php`, else the first record) and the "create
   form" closing shot. Present the outline:

   ```
   Showcase outline:
     1. Login (3s pause before Log In)
     2. Dashboard (3s pause)
     3. Process [A]: visit /nova/resources/{uri-a} -> pause 3s -> [action] -> …
     4. Process [B]: …
     5. Seeded detail: {Model} #{reference}
     6. Create form: /nova/resources/{primary-uri}/new
   ```

2. **Generate the ShowcaseTest.** Render the template with `{PackageNamespace}`
   from `composer.json` PSR-4, `{Module}` from the namespace's last segment,
   `{module}` lowercase for the method name, one segment per subprocess, the
   seeded record block, and `{primary-uri}` from the headline aggregate. Write
   `tests/Browser/{Module}ShowcaseTest.php`. Confirm the `showcase` composer
   script exists (add it if `opscale-init` didn't).

**Wait for user approval before continuing.**

### Phase group D — Validation loop (walkthrough passes in visible Chrome)

Static pre-check that all three artifacts exist and are wired:

```bash
node scripts/validate-showcase.mjs
```

Then run the walkthrough end to end against the Nova DevTool workbench until it
exits green:

```
1. php -l tests/Browser/{Module}ShowcaseTest.php
   on syntax error: fix the template rendering, re-run.

2. composer run showcase
   chains `composer run build` (rebuilds the workbench, syncs ChromeDriver,
   copies assets) then runs the showcase test.
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
- Do not mark the skill complete with a red or skipped walkthrough — the point
  is the uninterrupted reel actually running.

The showcase runs on demand; it is NOT in the default `composer run
test:browser` suite. CI runs the smoke ResourceTests (headless) for gating; the
showcase is for stakeholders.

**Wait for user approval before continuing.**

## Sample

The three artifacts (seeder demo, menu, showcase test) — see
`references/sample-output.md`. Per-artifact contracts live in
`references/seeder.md` and `references/menu.md`.

## Success condition

```bash
node scripts/validate-showcase.mjs
composer showcase
```

`validate-showcase.mjs` exit 0 = all three artifacts present; `composer
showcase` exit 0 = the guided walkthrough ran green in visible Chrome.
