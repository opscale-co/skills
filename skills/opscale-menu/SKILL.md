---
name: opscale-menu
description: >
  Generates a user-friendly Nova menu organized around how the module is
  actually used — its processes and the operator's tasks — not a flat
  alphabetical list of entities. Step 12 — runs after opscale-seed, before
  opscale-showcase. Trigger: "generate the menu", "organize the Nova sidebar",
  "make the menu user-friendly". Use it whenever the Nova sidebar/menu needs
  organizing, even loosely phrased. Not for generating Resources themselves
  (opscale-ui).
---

# opscale-menu

## Context

### Purpose — why this skill exists

Nova's auto-discovery lists every Resource alphabetically in the sidebar. For a module with 15+ aggregates plus 5+ child entities, that produces an unsorted wall of links — the operator has no idea where to start. The first visual impression of a finished module should mirror the BPMN's natural phases: open the day → run operations → control → close.

Doing this by hand on every module is repetitive. This skill automates it.

This skill is **Step 2 of the Presentation phase**. It runs after `opscale-seed` and before `opscale-showcase`. Seed makes every page render; menu makes the sidebar navigable the way an operator thinks; showcase then walks through the result as a guided demo.

### Aggregate-roots-only rule

**Only aggregate roots appear in the Nova sidebar.** Child aggregates are reachable exclusively as tabs of their root (see `opscale-ui`). Non-root Resources must set `public static $displayInNavigation = false;` (or override `availableForNavigation()` to return `false`). A sidebar flooded with sub-entities (Quota, Disbursement, Repayment, AuditLog, ...) defeats the user-task orientation the menu exists to provide — operators navigate by aggregate root, then drill into tabs. Cross-reference: `opscale-ui` enforces the corresponding child-as-tab pattern on the Resource side.

### Prerequisites

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | `opscale-ui` has been run | `src/Nova/*.php` contains at least one Resource | Stop. Run `/opscale-ui` first — there's nothing to put in a menu otherwise. |
| 3 | `opscale-seed` has been run | `workbench/database/seeders/DatabaseSeeder.php` populated | Stop. Run `/opscale-seed` first — the Presentation phase starts there. |
| 4 | Workbench provider exists | `workbench/app/Providers/NovaServiceProvider.php` | Create it via `opscale-init` if absent. |

### Output

Edits **`workbench/app/Providers/NovaServiceProvider.php`** in place to:

1. Add `use` imports for `Laravel\Nova\Menu\{Menu, MenuItem, MenuSection}` and `Laravel\Nova\Nova` (aliased to avoid clashing with the DevTool alias).
2. Call `Nova::mainMenu(function (Request $request) { return [...]; })` in the provider's `boot()` method.
3. **Filter to aggregate roots only** — include a Resource only when `$displayInNavigation !== false` AND `availableForNavigation()` returns `true`.
4. Group the remaining (root) Resources in `src/Nova/` **by the module's processes** (see below).
5. Render one `MenuSection::make(__('{Section}'), [...])->icon(...)->collapsable()` per group.

The generated menu block sits between markers so re-runs are idempotent:

```php
// >>> opscale-menu:start
// (generated content — do not edit; re-run opscale-menu to update)
// <<< opscale-menu:end
```

### Process-driven grouping (preferred)

A user-friendly menu mirrors **what the operator does**, not which tables exist. Read `final/process.md` — the **Ordered flow** subprocesses — and build the sidebar around them:

- One section per natural phase / process group, in the **order the operator works** (e.g. open the day → run operations → control → close), not alphabetical.
- Lead with the operator's primary entry points (the screens a process starts from); push catalogs, configuration, and reports to the bottom.
- Label sections by the **task** ("Cash operations"), not by the entity type ("Transactions table").

Only when the spec gives no process information, fall back to the name heuristic below.

### Heuristic grouping (fallback)

When the Resource does not declare a `MENU_SECTION` constant, the skill infers a section by matching the Resource class name against these patterns (first match wins). Patterns calibrated against real Opscale modules (Teller, Loans, Membership, KYC):

| Section | Pattern (case-insensitive, on the model class name) | Icon |
|---------|-----------------------------------------------------|------|
| `Day Lifecycle` | `OperatingDay`, `Vault`, `Branch`, `Session`, `Drawer`, `Box` | `clock` |
| `Cash Operations` | `Transaction`, `Transfer`, `Payment`, `Disbursement`, `AuthorizationRequest` | `cash` |
| `Member Operations` | `Application`, `Onboarding`, `Identity`, `Membership` | `user-group` |
| `Loan Operations` | `Loan`, `Installment`, `Amortization` | `currency-dollar` |
| `Control & Audit` | `Count`, `Discrepancy`, `Audit`, `Alert`, `Verification` | `shield-check` |
| `Catalogs` | `Template`, `Policy`, `Denomination`, `Category`, `Type`, `Catalog`, `Setting` | `view-list` |
| `Reports` | `Report`, `Statement`, `Statistic`, `Dashboard` | `chart-bar` |
| `Configuration` | (anything not matched above) | `cog` |

Sections are emitted in the order listed (lifecycle first, operations next, controls and catalogs last). Empty sections are omitted entirely.

### Explicit override

When the heuristic gets it wrong, the Resource can opt out by declaring:

```php
class CashTransaction extends Resource
{
    public const MENU_SECTION = 'Cash Operations';
    public const MENU_ICON = 'cash';
    public const MENU_ORDER = 10;
    // ...
}
```

The skill reads these constants via reflection and overrides the heuristic. `MENU_ORDER` controls ordering inside a section; default is alphabetical.

### Domain Rules

1. **All labels translatable** — every `MenuSection::make` and `MenuItem` label passes through `__()`.
2. **Aggregate roots only** — only Resources representing aggregate roots appear in the sidebar. Child Resources must declare `public static $displayInNavigation = false;` (or override `availableForNavigation()`). The menu generator MUST exclude any Resource where `$displayInNavigation === false`. Cross-reference: `opscale-ui` makes child aggregates tabs of their root.
3. **Idempotent** — re-running the skill REPLACES the previous `mainMenu()` block between the markers. Never appends, never duplicates.
4. **Sections in lifecycle order** — Day Lifecycle → Operations → Control → Catalogs → Reports → Configuration. Empty sections are dropped.
5. **Explicit constants beat the heuristic** — `MENU_SECTION`, `MENU_ICON`, `MENU_ORDER` on a Resource class override the pattern match.
6. **Workbench provider only** — this skill edits `workbench/app/Providers/NovaServiceProvider.php`, not any provider in `src/`. The host application that consumes the package decides its own menu; this skill only shapes the developer-facing workbench UI.

## Steps

### Phase 1 — Inventory aggregate roots (filter `$displayInNavigation !== false`)

```bash
php -r 'require "vendor/autoload.php";
  foreach (glob("src/Nova/*.php") as $f) {
    $class = "{PackageNamespace}\\\\Nova\\\\" . basename($f, ".php");
    $r = new ReflectionClass($class);
    // Filter: aggregate roots only. Skip anything with
    // $displayInNavigation = false or availableForNavigation() === false.
    $displayInNavigation = $r->getStaticPropertyValue("displayInNavigation", true);
    if ($displayInNavigation === false) { continue; }
    // Inspect MENU_SECTION / MENU_ICON / MENU_ORDER constants
    $constants = $r->getConstants();
    echo $class . "\t" . ($constants["MENU_SECTION"] ?? "auto") . "\n";
  }'
```

The filter is mandatory: only Resources representing aggregate roots reach the sidebar. Present the resolved set to the user.

**Wait for user approval before continuing.**

### Phase 2 — Propose menu structure

Cross-reference the inventory with `final/process.md` *Ordered flow* and group the aggregate roots by process (preferred) or the heuristic (fallback). Present the structure:

```
Proposed sidebar:

[Day Lifecycle]    icon: clock
  - AgencyOperatingDay
  - CashDrawerSession

[Cash Operations]  icon: cash
  - CashTransaction
  - InternalTransfer

[Catalogs]         icon: view-list
  - Denomination
  - TransactionTemplate

[Configuration]    icon: cog
  - ...
```

Confirm the section order, icon mapping, and per-section item order with the user (`MENU_ORDER` overrides win automatically when set on a Resource).

**Wait for user approval before continuing.**

### Phase 3 — Generate provider menu block (with `>>> opscale-menu:start` marker)

Build the PHP snippet inside the `>>> opscale-menu:start` / `<<< opscale-menu:end` markers:

```php
use Illuminate\Http\Request;
use Laravel\Nova\Dashboards\Main;
use Laravel\Nova\Menu\MenuItem;
use Laravel\Nova\Menu\MenuSection;
use Laravel\Nova\Nova as NovaFacade;

// inside boot():
// >>> opscale-menu:start
// Only aggregate roots are listed. Child resources (Quota, Disbursement,
// Repayment, AuditLog, ...) are reachable as tabs of their root and have
// $displayInNavigation = false on the Resource — they MUST NOT appear here.
NovaFacade::mainMenu(function (Request $request): array {
    return [
        MenuSection::dashboard(Main::class)->icon('chart-bar'),

        MenuSection::make(__('Day Lifecycle'), [
            MenuItem::resource(\{PackageNamespace}\Nova\AgencyOperatingDay::class),
            MenuItem::resource(\{PackageNamespace}\Nova\CashDrawerSession::class),
        ])->icon('clock')->collapsable(),

        MenuSection::make(__('Cash Operations'), [
            MenuItem::resource(\{PackageNamespace}\Nova\CashTransaction::class),
            MenuItem::resource(\{PackageNamespace}\Nova\Loan::class),
        ])->icon('cash')->collapsable(),

        // ... other sections — roots only
    ];
});
// <<< opscale-menu:end
```

Every label MUST be wrapped in `__()` so the menu respects the package's locale (Spanish for Unicoop, English for upstream Opscale packages).

Read the existing `workbench/app/Providers/NovaServiceProvider.php`. Insert the `use` statements alphabetically. Inject the marker block inside `boot()`, after `parent::boot()`. Do NOT replace any existing custom logic outside the markers. If a previous `>>> opscale-menu:start` block exists, REPLACE it (idempotent re-runs).

**Wait for user approval before continuing.**

### Phase 4 — Verify

```bash
php -l workbench/app/Providers/NovaServiceProvider.php
composer dump-autoload --no-scripts > /dev/null
vendor/bin/testbench package:discover --ansi > /dev/null
```

If `php -l` or `package:discover` fails, the inserted block has a syntax error — fix and re-run.

Boot the workbench briefly (`composer run serve` or testbench equivalent) and confirm the sidebar renders the expected sections in the expected order, in the locale configured by `opscale-debug`. Empty sections must not appear; child aggregates must not appear.

**Wait for user approval before continuing.**

## Sample

Nova `MenuSection` block with marker — see `references/sample-output.md`.

## Success condition

```bash
node skills/opscale-menu/scripts/validate-menu.mjs --provider=workbench/app/Providers/NovaServiceProvider.php
```

Exit code 0 = pass.
