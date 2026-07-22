# Sample output — opscale-debug

Anonymized excerpt derived from a working Opscale module
(`Unicoop/membresia`). Shows the SHAPE of what the skill produces,
not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body. The full original file lives in the source module.

---

## 1. `.env.example` block (project root)

```dotenv
APP_ENV=local
APP_DEBUG=true
APP_LOCALE=en
APP_FALLBACK_LOCALE=en

# Telescope — debug the domain (jobs, events, queries, model lifecycle)
TELESCOPE_ENABLED=true
TELESCOPE_DRIVER=database
TELESCOPE_PRUNE_HOURS=48
TELESCOPE_ALLOWED_EMAILS=

# Debugbar — in-browser toolbar (local only, follows APP_DEBUG)
DEBUGBAR_ENABLED=true

# Xdebug — step-through the logic (local + staging only)
# Configure in php.ini or pass via XDEBUG_MODE / XDEBUG_CONFIG when invoking PHP:
#   xdebug.mode=debug,develop
#   xdebug.start_with_request=yes
#   xdebug.client_host=127.0.0.1
#   xdebug.client_port=9003
#   xdebug.idekey=VSCODE
```

## 2. `WorkbenchServiceProvider` — Telescope registration

```php
namespace Workbench\App\Providers;

use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;
use Laravel\Telescope\TelescopeServiceProvider as BaseTelescopeServiceProvider;

class WorkbenchServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Only register Telescope outside of unit-test runs so the
        // testbench's in-memory database doesn't get cluttered.
        if ($this->app->environment(['local', 'staging']) && ! $this->app->runningUnitTests()) {
            $this->app->register(BaseTelescopeServiceProvider::class);
        }

        // ... contract bindings ...
    }

    public function boot(): void
    {
        Gate::define(
            'viewTelescope',
            fn ($user = null): bool => $this->app->environment(['local', 'staging', 'testing']),
        );
    }
}
```

## 3. What gets debugged where

| Surface | Tool          | Where it shows up                                            |
|---------|---------------|--------------------------------------------------------------|
| UI      | Debugbar      | Bottom panel on every Nova page (workbench only)             |
| Domain  | Telescope     | `/telescope` — jobs, events, queries, model writes           |
| Logic   | Xdebug        | IDE breakpoints inside `Action::handle()`                    |
