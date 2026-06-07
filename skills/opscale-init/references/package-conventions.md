# Step 4b — Establish package conventions (modules/packages only)

### Step 4b — Establish package conventions (modules/packages only)

When `PROJECT_TYPE` is `module` or `package`, the workbench-based development
loop (`testbench serve`, `testbench dusk:*`, Browser tests) requires three
opinionated defaults that downstream skills assume. Set them now so they
don't have to be patched in later.

#### 4b.1 — Migrations live at `database/migrations/` (package root)

Opscale convention: migrations live at the **package root** in
`database/migrations/`, NOT in `src/Database/Migrations/`. This matches
Laravel's host-app convention and lets `discoversMigrations()` in the
package service provider work without extra wiring.

```bash
mkdir -p database/migrations
```

#### 4b.2 — `testbench.yaml` providers (Nova + Inertia + Fortify + Dusk)

The Dusk server in `testbench-dusk` boots a fresh Laravel app per request and
loads providers ONLY from `testbench.yaml`. Missing providers fail SILENTLY
with 500 errors that don't reach Laravel's log. Default them now:

```yaml
laravel: '@testbench'

env:
  - APP_LOCALE=es
  - APP_FALLBACK_LOCALE=es
  - APP_FAKER_LOCALE=es_ES

providers:
  - Inertia\ServiceProvider                    # Nova uses Inertia (@inertia blade directive)
  - Laravel\Fortify\FortifyServiceProvider     # Nova auth uses Fortify (StatefulGuard binding)
  - Laravel\Dusk\DuskServiceProvider           # provides _dusk/login for loginAs()
  - Laravel\Nova\NovaCoreServiceProvider
  - Laravel\Nova\NovaServiceProvider
  - Workbench\App\Providers\WorkbenchServiceProvider
  - Workbench\App\Providers\NovaServiceProvider
  - {PackageNamespace}\SubdomainServiceProvider

seeders:
  - Workbench\Database\Seeders\DatabaseSeeder

workbench:
  start: /nova
  build:
    - package:discover
    - asset-publish
    - create-sqlite-db
    - db:wipe
    - migrate:refresh
    - 'db:seed --class="Workbench\Database\Seeders\DatabaseSeeder"'
  assets:
    - nova-assets
  sync: []

purge:
  directories:
    - lang/*
    - public/vendor/*
```

Replace `{PackageNamespace}` with the package's PHP namespace
(e.g. `Unicoop\Teller`). If `testbench.yaml` already exists, merge — do NOT
overwrite custom env/seeder entries.

#### 4b.3 — Pre-flight backup when reinitializing an existing module

If the target directory already contains `src/`, `database/migrations/`, or
`tests/` populated, snapshot the module BEFORE scaffolding from zero — the
user often runs `opscale-init` against an existing module to rebuild it:

```bash
if [ -d src ] && [ "$(ls -A src 2>/dev/null)" ]; then
  STAMP=$(date +%Y%m%d-%H%M%S)
  rsync -a --exclude vendor --exclude node_modules ./ ../$(basename "$PWD").backup-$STAMP/
  echo "📦  Backup saved to ../$(basename "$PWD").backup-$STAMP/"
fi
```

The backup excludes `vendor/` and `node_modules/` so it's a few MB instead of
hundreds. It is meant for diffing the new flow against the previous state, not
for restoring — `git` covers that.

---
