---
name: opscale-seed
description: >
  Generates a workbench DatabaseSeeder with a coherent demo dataset that
  exemplifies a complete run of the module's flow — connected records that let
  someone walk each process end to end, not isolated rows. Step 11 — first step
  of Presentation, runs after Review. Trigger: "generate the seeder", "seed demo
  data", "fix empty Nova pages". Use it whenever demo/workbench data is needed or
  Nova pages look empty, even if just "seed it". Not for production data or test
  fixtures (opscale-test).
---

# opscale-seed

## Prerequisites

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | `opscale-domain` has been run | `src/Models/` populated | Stop. Run `/opscale-domain` first — nothing to seed. |
| 3 | Workbench User model exists | `workbench/app/Models/User.php` | Restore from a sibling module or create the standard testbench User model. |

This skill is **Step 1 of the Presentation phase**. It runs after Review has
signed off on quality and is the entry point that turns the module into a
functional demo: it produces the seeded baseline that `opscale-menu` then
organizes and that `opscale-showcase` walks through end-to-end.

## Why this skill exists

The demo must let someone **walk a complete flow of the module**, not just see
a row in each table. The seeded dataset has to be **coherent and connected** —
the records of one process link to the next so `opscale-showcase` can drive each
process in `spec.md` *Procesos identificados* end to end, and so empty/half-
populated pages don't mask Resource bugs (missing relations, broken casts, enum
mismatches). Every module ends up reinventing the seeder; this skill makes the
convention explicit.

## Output

Writes / overwrites:
- `workbench/database/seeders/DatabaseSeeder.php` — the orchestrator
- (Optional) `workbench/database/factories/{Model}Factory.php` per aggregate

If `DatabaseSeeder.php` already exists with custom content, the skill
**replaces** the Teller-style scaffolding block delimited by markers but
preserves any custom blocks the developer added outside the markers:

```php
// >>> opscale-seed:start
// (generated content — do not edit; re-run opscale-seed to update)
// <<< opscale-seed:end
```

## Seeding contract

**Order matters** — entities must be created in FK-dependency order. The
skill walks the DBML / models in this order:

1. **Cross-subdomain logical IDs** — generate ULIDs for `agency_id`,
   `teller_id`, `supervisor_id`, `member_id`. Store them locally so the
   downstream inserts reference the same IDs. (Opscale is single-tenant by
   design — there is no `tenant_id` to bootstrap.)
2. **Workbench admin user** — `admin@laravel.com / password`. The Browser
   `loginToNova()` helper hardcodes this; do NOT change the email.
3. **Catalog tables** — anything with `is_active` and no FKs:
   denominations, policies, templates. Real-world defaults
   (USD denominations 1/5/10/20/50/100 + coins; UIF threshold $10,000;
   one TransactionTemplate per BPMN logic id that mentions a Template).
4. **Aggregate roots in topological order** — open day, then vault session
   + drawer session, then one transaction + one transfer + one count + one
   discrepancy + one authorization request.
5. **Resolved states, not pending** — seeded records should be in
   "operating"/"executed"/"confirmed"/"open" states by default so the
   detail page exercises the happy path. Add one record in a pending state
   if the module has a critical pending-flow UI to demonstrate.
6. **One complete flow per process** — for each process in `spec.md`
   *Procesos identificados*, seed the connected records needed to walk it from
   start to finish (the trigger record, the entities each step touches, the
   final outcome). The dataset is the script `opscale-showcase` follows; if a
   process can't be walked end to end on the seed, the seed is incomplete.

## Template

```php
<?php

declare(strict_types=1);

namespace Workbench\Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Str;
use {PackageNamespace}\Models\{...};
use {PackageNamespace}\Models\Enums\{...};
use Workbench\App\Models\User;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // >>> opscale-seed:start

        // --- 1. Workbench admin (used by Browser loginToNova()) ---
        if (User::query()->count() === 0) {
            User::factory()->create([
                'name'  => 'Admin User',
                'email' => 'admin@laravel.com',
            ]);
            User::factory()->count(3)->create();
        }

        // --- 2. Cross-subdomain logical IDs (no tenant — single-tenant module) ---
        $agencyId     = (string) Str::ulid();
        $tellerId     = (string) Str::ulid();
        $supervisorId = (string) Str::ulid();
        $memberId     = (string) Str::ulid();

        // --- 3. Catalogs (no FKs, idempotent) ---
        // {generate one block per catalog table, with real-world defaults}
        // e.g. denominations: USD 100/50/20/10/5/1 + coin 25c
        //      operational limit policy: max_cash=25000, min_cash=500
        //      uif threshold policy: daily_amount=10000
        //      transaction templates: one per BPMN logic id referencing a template

        // --- 4. Aggregate roots in topological order ---
        // {generate $day = AgencyOperatingDay::create([...]);}
        // {generate $vault, $vaultSession, $box, $drawer, $tx, $transfer, $count, $discrepancy, $authReq}
        //
        // Use resolved states by default (Open / Operating / Confirmed / Executed).

        // <<< opscale-seed:end
    }
}
```

## Workflow

### Step 1 — Inventory

Read `src/Models/` and `src/Models/Enums/`. Build the topological order from
FK constraints. Identify catalog tables (no FKs to other tables in the
package + an `is_active` column) and aggregate roots (everything else with
an FK chain that bottoms out at a catalog or root).

Present the planned order to the user:

```
Seeding plan for {module}:

Catalogs (5):
  - denominations
  - operational_limit_policies
  - uif_threshold_policies
  - transaction_templates
  - transaction_template_steps

Aggregate roots (8):
  - agency_operating_days   → vault_sessions → cash_drawer_sessions → ...
  - vaults
  - ...

Confirm before generating?
```

### Step 2 — Generate / patch

Render the template above with real model + enum imports, real catalog
defaults, real aggregate constructors. Overwrite the marked block in
`DatabaseSeeder.php`; preserve anything outside the markers.

### Step 3 — Smoke gate

```bash
# 1. Lints
php -l workbench/database/seeders/DatabaseSeeder.php

# 2. Composer autoload picks up the seeder
composer dump-autoload --no-scripts > /dev/null

# 3. Actually seed against a fresh sqlite
vendor/bin/testbench workbench:create-sqlite-db --ansi
vendor/bin/testbench migrate:refresh --ansi
vendor/bin/testbench db:seed --class='Workbench\Database\Seeders\DatabaseSeeder' --ansi

# 4. Verify at least one record per aggregate
vendor/bin/testbench tinker --execute='
foreach ([
    \{PackageNamespace}\Models\AgencyOperatingDay::class,
    // ...one line per aggregate root...
] as $m) echo $m . ": " . $m::count() . PHP_EOL;'
```

If any aggregate ends with 0 records, the seeder is missing it. Fix and re-run.

## Domain Rules

1. **Single-tenant by design** — never seed a `tenant_id` field, never write
   per-row tenancy logic. Opscale modules install against one database per
   implementation; the seeder represents that single installation.
2. **Admin user is fixed** — `admin@laravel.com / password`. Browser tests
   hardcode this; changing it breaks `loginToNova()`.
3. **Catalogs use real-world defaults** — currency, thresholds, denominations,
   limits should match the regulatory context (e.g. UIF $10,000 for El
   Salvador). The point is for the Nova UI to look "real" to a stakeholder.
4. **Resolved states by default** — seeded records are in the operating /
   executed / confirmed state, NOT pending. Add a single pending record only
   if the module has a UI specifically for resolving pending items.
5. **Topological order, never random** — FK parents always inserted before
   children. The skill walks the FK graph; it does not iterate models
   alphabetically.
6. **Markers preserve custom additions** — the generated block lives between
   `>>> opscale-seed:start` and `<<< opscale-seed:end`. Anything outside the
   markers survives re-runs.
7. **No business correctness tests in the seeder** — the seeder is for UI
   demo + Browser smoke. Business invariants are verified in Feature tests,
   not by seeded fixtures.
