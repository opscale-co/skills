# Reference — Seed demo data (Presentation phase group A)

The seeder is the **script the guided walkthrough follows**. It must let someone
walk a *complete* run of each process end to end — connected records where one
process's output is the next one's input, not one isolated row per table. Empty
or half-populated pages also mask Resource bugs (missing relations, broken
casts, enum mismatches), so a coherent dataset doubles as a smoke check.

## Output

Writes / overwrites the demo block inside:

- `workbench/database/seeders/DatabaseSeeder.php` — the orchestrator skeleton and
  per-aggregate factories are left by `opscale-domain`; this phase fills the
  connected demo dataset between the markers.

```php
// >>> opscale-seed:start
// (generated content — do not edit; re-run opscale-showcase to update)
// <<< opscale-seed:end
```

The markers keep the historical `opscale-seed` prefix so re-runs replace the
block in modules generated before Seed merged into opscale-showcase (idempotent,
no duplicate blocks). Anything outside the markers survives re-runs.

## Seeding contract — order matters

Entities are created in FK-dependency order. Walk the DBML / models in this
order:

1. **Cross-subdomain logical IDs** — generate ULIDs for the external-reference
   ids (`agency_id`, `teller_id`, `supervisor_id`, `member_id`, …). Store them
   locally so downstream inserts reference the same IDs. (Opscale is
   single-tenant by design — there is no `tenant_id` to bootstrap.)
2. **Workbench admin user** — `admin@laravel.com / password`. The Browser
   `loginToNova()` helper hardcodes this; do not change the email.
3. **Catalog tables** — anything with `is_active` and no FKs: denominations,
   policies, templates. Use real-world defaults (USD denominations
   1/5/10/20/50/100 + coins; UIF threshold $10,000 for El Salvador; one
   template per BPMN logic id that mentions a Template).
4. **Aggregate roots in topological order** — FK parents before children (open
   day → vault session + drawer session → one transaction + one transfer + one
   count + one discrepancy + one authorization request).
5. **Resolved states, not pending** — seeded records default to
   operating / executed / confirmed / open states so the detail page exercises
   the happy path. Add one pending record only if the module has a UI
   specifically for resolving pending items.
6. **One complete flow per process** — for each subprocess in
   `docs/plan/process.txt`, seed the connected records needed to walk it from
   trigger to final outcome. If a process cannot be walked end to end on the
   seed, the seed is incomplete.

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

        // --- 3. Catalogs (no FKs, idempotent, real-world defaults) ---
        // {one block per catalog table}

        // --- 4. Aggregate roots in topological order ---
        // {$day = AgencyOperatingDay::create([...]); $vault, $drawer, $tx, …}
        // Use resolved states by default (Open / Operating / Confirmed / Executed).

        // <<< opscale-seed:end
    }
}
```

## Domain rules

1. **Single-tenant by design** — never seed a `tenant_id` field. Opscale modules
   install against one database per implementation; the seeder represents that
   single installation.
2. **Admin user is fixed** — `admin@laravel.com / password`. Browser tests
   hardcode this; changing it breaks `loginToNova()`.
3. **Catalogs use real-world defaults** — currency, thresholds, denominations,
   limits match the regulatory context so the Nova UI looks "real" to a
   stakeholder.
4. **Resolved states by default** — seeded records are operating / executed /
   confirmed, not pending (add a single pending record only for a resolve UI).
5. **Topological order, never random** — FK parents always inserted before
   children; walk the FK graph, do not iterate models alphabetically.
6. **Markers preserve custom additions** — anything outside the
   `opscale-seed` markers survives re-runs.
7. **No business-correctness tests in the seeder** — the seeder is for UI demo +
   Browser smoke. Business invariants live in Feature tests.

## Verify (migrate:fresh --seed)

```bash
php -l workbench/database/seeders/DatabaseSeeder.php
composer dump-autoload --no-scripts > /dev/null
vendor/bin/testbench workbench:create-sqlite-db --ansi
vendor/bin/testbench migrate:refresh --ansi
vendor/bin/testbench db:seed --class='Workbench\Database\Seeders\DatabaseSeeder' --ansi
```

Then confirm at least one record per aggregate root (tinker `::count()`), and
that every subprocess in `docs/plan/process.txt` can be walked end to end on the
seeded data. If any aggregate ends with 0 records, the seeder is missing it.
