---
name: opscale-menu
description: Generates a user-friendly Nova menu for an Opscale module by introspecting src/Nova/ and grouping aggregate Resources into sections (e.g. Day Lifecycle, Operations, Control, Catalogs). Writes the MenuSection block into workbench/app/Providers/NovaServiceProvider.php so the workbench Nova UI presents the package the way an operator would navigate it. Trigger when the user says "generate the menu", "organize the Nova sidebar", "group the resources" or after opscale-ui finishes and the sidebar is still flat. This is a finishing skill — not part of the strict 1→10 sequence.
---

# opscale-menu

## Prerequisites

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | `opscale-ui` has been run | `src/Nova/*.php` contains at least one Resource | Stop. Run `/opscale-ui` first — there's nothing to put in a menu otherwise. |
| 3 | Workbench provider exists | `workbench/app/Providers/NovaServiceProvider.php` | This is the file the skill writes into. Create it via `opscale-init` if absent. |

This skill is a **finishing skill**. It runs after `opscale-ui` (which populates
`src/Nova/`) and is independent of the rest of the Review phase. Run it
whenever the sidebar looks flat after a fresh generation.

## Why this skill exists

Nova's auto-discovery lists every Resource alphabetically in the sidebar. For
a module with 15+ aggregates plus 5+ child entities, that produces an
unsorted wall of links — the operator has no idea where to start. The first
visual impression of a finished module should mirror the BPMN's natural
phases: open the day → run operations → control → close.

Doing this by hand on every module is repetitive. This skill automates it.

## Output

Edits **`workbench/app/Providers/NovaServiceProvider.php`** in place to:

1. Add `use` imports for `Laravel\Nova\Menu\{Menu, MenuItem, MenuSection}` and
   `Laravel\Nova\Nova` (aliased to avoid clashing with the DevTool alias).
2. Call `Nova::mainMenu(function (Request $request) { return [...]; })` in
   the provider's `boot()` method.
3. Group every Resource in `src/Nova/` (excluding children with
   `availableForNavigation() === false`) by a heuristic or by an explicit
   `MENU_SECTION` constant on the Resource class.
4. Render one `MenuSection::make(__('{Section}'), [...])->icon(...)->collapsable()`
   per group.

## Heuristic grouping

When the Resource does not declare a `MENU_SECTION` constant, the skill
infers a section by matching the Resource class name against these patterns
(first match wins). The patterns are calibrated against real Opscale modules
(Teller, Loans, Membership, KYC):

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

Sections are emitted in the order listed (lifecycle first, operations next,
controls and catalogs last). Empty sections are omitted entirely.

## Explicit override

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

The skill reads these constants via reflection and overrides the heuristic.
`MENU_ORDER` controls ordering inside a section; default is alphabetical.

## Workflow

### Step 1 — Inventory Resources

```bash
php -r 'require "vendor/autoload.php";
  foreach (glob("src/Nova/*.php") as $f) {
    $class = "{PackageNamespace}\\\\Nova\\\\" . basename($f, ".php");
    $r = new ReflectionClass($class);
    // Skip children hidden from navigation
    $method = $r->hasMethod("availableForNavigation") ? $r->getMethod("availableForNavigation") : null;
    // Inspect MENU_SECTION / MENU_ICON / MENU_ORDER constants
    $constants = $r->getConstants();
    echo $class . "\t" . ($constants["MENU_SECTION"] ?? "auto") . "\n";
  }'
```

Present the resolved grouping to the user. Confirm or adjust before writing.

### Step 2 — Generate the menu block

Build the PHP snippet:

```php
use Illuminate\Http\Request;
use Laravel\Nova\Dashboards\Main;
use Laravel\Nova\Menu\MenuItem;
use Laravel\Nova\Menu\MenuSection;
use Laravel\Nova\Nova as NovaFacade;

// inside boot():
NovaFacade::mainMenu(function (Request $request): array {
    return [
        MenuSection::dashboard(Main::class)->icon('chart-bar'),

        MenuSection::make(__('Day Lifecycle'), [
            MenuItem::resource(\{PackageNamespace}\Nova\AgencyOperatingDay::class),
            MenuItem::resource(\{PackageNamespace}\Nova\CashDrawerSession::class),
            // ...
        ])->icon('clock')->collapsable(),

        MenuSection::make(__('Cash Operations'), [
            MenuItem::resource(\{PackageNamespace}\Nova\CashTransaction::class),
            // ...
        ])->icon('cash')->collapsable(),

        // ... other sections
    ];
});
```

Every label MUST be wrapped in `__()` so the menu respects the package's
locale (Spanish for Unicoop, English for upstream Opscale packages).

### Step 3 — Patch the provider

Read the existing `workbench/app/Providers/NovaServiceProvider.php`. Insert
the `use` statements alphabetically. Inject the `mainMenu(...)` call inside
`boot()`, after `parent::boot()`. Do NOT replace any existing custom logic.

If a previous `mainMenu(...)` call exists, REPLACE the previous block
(idempotent re-runs are required so iterating on the menu doesn't pile up
duplicates).

### Step 4 — Smoke gate

```bash
php -l workbench/app/Providers/NovaServiceProvider.php
composer dump-autoload --no-scripts > /dev/null
vendor/bin/testbench package:discover --ansi > /dev/null
echo "✅ Menu generated and provider loads."
```

If `php -l` or `package:discover` fails, the inserted block has a syntax
error — fix and re-run.

## Domain Rules

1. **All labels translatable** — every `MenuSection::make` and `MenuItem`
   label passes through `__()`.
2. **Children hidden from navigation are excluded** — Resources whose
   `availableForNavigation()` returns `false` never appear in the menu.
3. **Idempotent** — re-running the skill REPLACES the previous `mainMenu()`
   call. Never appends, never duplicates.
4. **Sections in lifecycle order** — Day Lifecycle → Operations → Control →
   Catalogs → Reports → Configuration. Empty sections are dropped.
5. **Explicit constants beat the heuristic** — `MENU_SECTION`, `MENU_ICON`,
   `MENU_ORDER` on a Resource class override the pattern match.
6. **Workbench provider only** — this skill edits
   `workbench/app/Providers/NovaServiceProvider.php`, not any provider in
   `src/`. The host application that consumes the package decides its own
   menu; this skill only shapes the developer-facing workbench UI.
