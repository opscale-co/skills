# Sample output — opscale-menu

Anonymized excerpt derived from a working Opscale module
(`Unicoop/membresia`). Shows the SHAPE of what the skill produces,
not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body. The full original file lives in the source module.

---

## `workbench/app/Providers/NovaServiceProvider.php` — `boot()` block

```php
use Laravel\Nova\Menu\MenuSection;
use Laravel\Nova\Menu\MenuItem;
use Laravel\Nova\Nova;
use Acme\Loans\Nova\{Application, Member, WithdrawalRequest, Policy};
// ...

public function boot(): void
{
    parent::boot();
    $this->bootRoutes();

    // >>> opscale-menu:start
    // Process-driven sidebar — only aggregate roots are exposed.
    // Children (Rule, RuleOption, Verification, Decision, Requirement,
    // Document, ContractDoc, …) are reachable through HasMany tabs on
    // their aggregate root's detail page.
    Nova::mainMenu(static fn (Request $request): array => [
        MenuSection::dashboard(Main::class)->icon('chart-bar'),

        // Admission cycle: PENDING → ACTIVE.
        MenuSection::make(__('Admission'), [
            MenuItem::resource(Application::class),
        ])->icon('clipboard-list'),

        // Flow outcome: the active Member.
        MenuSection::make(__('Members'), [
            MenuItem::resource(Member::class),
        ])->icon('user-group'),

        // Flow exit: Member withdrawals.
        MenuSection::make(__('Withdrawals'), [
            MenuItem::resource(WithdrawalRequest::class),
        ])->icon('user-remove'),

        // Per-institution configuration: Policy → Rules → Options → Conditions.
        MenuSection::make(__('Catalog'), [
            MenuItem::resource(Policy::class),
        ])->icon('view-list'),
    ]);
    // <<< opscale-menu:end
}
```

### Why this is not just `auto-grouped resources`

| Default Nova behavior         | What opscale-menu emits                                  |
|-------------------------------|-----------------------------------------------------------|
| Alphabetical, flat list       | One section per process / role view in the module         |
| Every Resource gets an entry  | Only aggregate roots — children open via the parent's tabs |
| English Resource class names  | `__('Section')` strings, auto-translated per locale       |
