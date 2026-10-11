# Reference — Nova menu (Presentation phase group B)

Nova's auto-discovery lists every Resource alphabetically in the sidebar. For a
module with 15+ aggregates plus child entities that is an unsorted wall of
links — the operator has no idea where to start. The first visual impression of
a finished module should mirror the process's natural phases: open the day → run
operations → control → close.

## Aggregate-roots-only rule

**Only aggregate roots appear in the Nova sidebar.** Child aggregates are
reachable exclusively as tabs of their root (see `opscale-ui`). Non-root
Resources set `public static $displayInNavigation = false;` (or override
`availableForNavigation()` to return `false`). The menu generator excludes any
Resource where `$displayInNavigation === false` — operators navigate by
aggregate root, then drill into tabs.

## Output

Edits `workbench/app/Providers/NovaServiceProvider.php` in place to:

1. Add `use` imports for `Laravel\Nova\Menu\{Menu, MenuItem, MenuSection}` and
   `Laravel\Nova\Nova` (aliased to avoid clashing with the DevTool alias).
2. Call `Nova::mainMenu(function (Request $request) { return [...]; })` in
   `boot()`, after `parent::boot()`.
3. Filter to aggregate roots only (`$displayInNavigation !== false` AND
   `availableForNavigation()` returns `true`).
4. Group the remaining root Resources **by the module's processes**.
5. Render one `MenuSection::make(__('{Section}'), [...])->icon(...)->collapsable()`
   per group.

The block sits between markers so re-runs are idempotent (the marker keeps the
historical `opscale-menu` prefix for backward-compatible replacement):

```php
// >>> opscale-menu:start
// (generated content — do not edit; re-run opscale-showcase to update)
// <<< opscale-menu:end
```

## Process-driven grouping (preferred)

Read `docs/plan/process.json` and build the sidebar around what the operator
does:

- One section per natural phase / process group, in the **order the operator
  works** (open the day → run operations → control → close), not alphabetical.
- Lead with the operator's primary entry points (the screens a process starts
  from); push catalogs, configuration, and reports to the bottom.
- Label sections by the **task** ("Cash operations"), not the entity type
  ("Transactions table").

Only when the spec gives no process information, fall back to the heuristic.

## Heuristic grouping (fallback)

When a Resource declares no `MENU_SECTION` constant, infer a section by matching
the Resource class name against these patterns (first match wins):

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

Sections are emitted in the order listed (lifecycle first, controls and catalogs
last). Empty sections are omitted entirely.

## Explicit override

A Resource can opt out of the heuristic:

```php
class CashTransaction extends Resource
{
    public const MENU_SECTION = 'Cash Operations';
    public const MENU_ICON = 'cash';
    public const MENU_ORDER = 10;
}
```

Read these constants via reflection; they override the heuristic. `MENU_ORDER`
controls ordering inside a section (default alphabetical).

## Template

```php
use Illuminate\Http\Request;
use Laravel\Nova\Dashboards\Main;
use Laravel\Nova\Menu\MenuItem;
use Laravel\Nova\Menu\MenuSection;
use Laravel\Nova\Nova as NovaFacade;

// inside boot(), after parent::boot():
// >>> opscale-menu:start
// Only aggregate roots are listed. Child resources (Quota, Disbursement,
// Repayment, AuditLog, …) are reachable as tabs of their root and have
// $displayInNavigation = false on the Resource — they must not appear here.
NovaFacade::mainMenu(function (Request $request): array {
    return [
        MenuSection::dashboard(Main::class)->icon('chart-bar'),

        MenuSection::make(__('Day Lifecycle'), [
            MenuItem::resource(\{PackageNamespace}\Nova\AgencyOperatingDay::class),
            MenuItem::resource(\{PackageNamespace}\Nova\CashDrawerSession::class),
        ])->icon('clock')->collapsable(),

        MenuSection::make(__('Cash Operations'), [
            MenuItem::resource(\{PackageNamespace}\Nova\CashTransaction::class),
        ])->icon('cash')->collapsable(),

        // … other sections — roots only
    ];
});
// <<< opscale-menu:end
```

Every label passes through `__()` so the menu respects the package's locale
(Spanish for Unicoop, English for upstream Opscale packages).

## Domain rules

1. **All labels translatable** — every `MenuSection::make` and `MenuItem` label
   passes through `__()`.
2. **Aggregate roots only** — exclude any Resource where
   `$displayInNavigation === false`; children become tabs of their root
   (`opscale-ui`).
3. **Idempotent** — re-running replaces the `mainMenu()` block between the
   markers; never appends, never duplicates.
4. **Sections in lifecycle order** — Day Lifecycle → Operations → Control →
   Catalogs → Reports → Configuration. Empty sections are dropped.
5. **Explicit constants beat the heuristic** — `MENU_SECTION`, `MENU_ICON`,
   `MENU_ORDER` on a Resource class override the pattern match.
6. **Workbench provider only** — edits
   `workbench/app/Providers/NovaServiceProvider.php`, not any provider in
   `src/`. The host application decides its own menu.

## Verify

```bash
php -l workbench/app/Providers/NovaServiceProvider.php
composer dump-autoload --no-scripts > /dev/null
vendor/bin/testbench package:discover --ansi > /dev/null
```

If `php -l` or `package:discover` fails, the inserted block has a syntax error.
Boot the workbench and confirm the sidebar renders the expected sections in
order; empty sections and child aggregates must not appear.
