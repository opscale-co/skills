---
name: opscale-debug
description: >
  Sets up debug tooling (Xdebug + Telescope) for local and staging. Step 8 —
  first step of Review, runs after opscale-logic. Trigger: "configure debug",
  "set up Telescope", "enable Xdebug".
  Use it whenever local/staging debug tooling needs setting up, even loosely phrased. Not for the test/quality stack (opscale-test) or release pipeline (opscale-release).
---

# opscale-debug

## Prerequisites — flexible

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | Inside a PHP/Laravel project | `composer.json` exists | Stop. Re-run `/opscale-init`. |

**Review-phase skills (`opscale-debug`, `opscale-test`, `opscale-release`) can be invoked at any point after `opscale-init`** — they do not require Plan or Generate phases to be complete. You can configure debug tooling on day 1 of an empty Laravel project. The only ordering constraint inside Review is: **`opscale-release` requires `opscale-test` to have produced test files first** (semantic-release will not gate a release without a test suite).

## Purpose

Configure Xdebug and Laravel Telescope for local and staging environments.
Nothing generated here affects production behavior — all configuration is
environment-gated.

Output is listed in `.specify/specs/{NNN}-{module-name}/plan.md` (debug section).

---

## Environments

| Tool | local | staging | production |
|------|-------|---------|------------|
| Xdebug | ✅ | ✅ | ❌ never |
| Telescope | ✅ | ✅ | ❌ never |
| Debugbar | ✅ | ❌ | ❌ never |

Both tools must be gated by environment checks. No debug tooling leaks to production.
The three MCP servers are development-only tools — never registered in production CI or deployed environments.

---

## Xdebug

### Installation

Add to `composer.json` under `require-dev`:

```json
"require-dev": {
    "php-xdebug/xdebug": "^3.0"
}
```

Or install via the system PHP extension:

```bash
# Ubuntu/Debian
sudo apt-get install php-xdebug

# macOS with Homebrew
pecl install xdebug

# Laravel Sail (Docker)
# Xdebug is available via the XDEBUG_MODE env variable — no separate install needed
```

### php.ini / php.ini-development

Add to your local `php.ini` or `php-xdebug.ini`:

```ini
[xdebug]
xdebug.mode=debug,develop
xdebug.start_with_request=yes
xdebug.client_host=host.docker.internal
xdebug.client_port=9003
xdebug.idekey=PHPSTORM
xdebug.log_level=0
```

For Laravel Sail, set in `.env`:

```env
SAIL_XDEBUG_MODE=develop,debug
SAIL_XDEBUG_CONFIG="client_host=host.docker.internal"
```

### VS Code configuration (`.vscode/launch.json`)

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Listen for Xdebug",
            "type": "php",
            "request": "launch",
            "port": 9003,
            "pathMappings": {
                "/var/www/html": "${workspaceFolder}"
            }
        }
    ]
}
```

### PhpStorm configuration

1. Go to **Settings → PHP → Debug**
2. Set Xdebug port to `9003`
3. Enable **"Listen for PHP Debug connections"** (phone icon in toolbar)
4. Set path mapping: `/var/www/html` → project root

---

## Laravel Telescope

### Installation

```bash
composer require laravel/telescope --dev
php artisan telescope:install
php artisan migrate
```

### Gate — restrict access to local and staging only

In `app/Providers/TelescopeServiceProvider.php`, gate access by environment:

```php
protected function gate(): void
{
    Gate::define('viewTelescope', function ($user) {
        return in_array(app()->environment(), ['local', 'staging']);
    });
}
```

For staging, additionally restrict by email or role:

```php
Gate::define('viewTelescope', function ($user) {
    if (app()->environment('local')) {
        return true;
    }

    if (app()->environment('staging')) {
        return in_array($user->email, config('telescope.allowed_emails', []));
    }

    return false;
});
```

Add to `.env.staging`:

```env
TELESCOPE_ENABLED=true
TELESCOPE_ALLOWED_EMAILS="dev@yourcompany.com,qa@yourcompany.com"
```

### TelescopeServiceProvider — full configuration

The complete `TelescopeServiceProvider` (gate + filtering + tags) lives in
`references/debug-configs.md`. Copy it from there when wiring Telescope.

### Prevent Telescope from loading in production

**The registration location depends on `PROJECT_TYPE` (read from
`.specify/memory/constitution.md`):**

| Project type | Register Telescope here | Why |
|--------------|-------------------------|-----|
| `app` | `app/Providers/AppServiceProvider.php` | Standard Laravel app — has its own AppServiceProvider |
| `module` / `package` | `workbench/app/Providers/WorkbenchServiceProvider.php` | A Nova package has NO `app/Providers/` of its own; Telescope is a workbench-only concern — host apps consuming the package register their own Telescope if they want it |
| `library` | Not applicable — libraries skip this skill | |

**For `app` projects:**

```php
// app/Providers/AppServiceProvider.php
public function register(): void
{
    if ($this->app->environment(['local', 'staging'])) {
        $this->app->register(TelescopeServiceProvider::class);
    }
}
```

And remove `App\Providers\TelescopeServiceProvider::class` from
`bootstrap/providers.php` if it was auto-added by `telescope:install`.

**For `module` / `package` projects:**

```php
// workbench/app/Providers/WorkbenchServiceProvider.php
use Laravel\Telescope\TelescopeServiceProvider as BaseTelescopeServiceProvider;

public function register(): void
{
    if ($this->app->environment(['local', 'staging', 'testing'])) {
        $this->app->register(BaseTelescopeServiceProvider::class);
    }

    \Illuminate\Support\Facades\Gate::define('viewTelescope', fn ($user = null): bool =>
        in_array($this->app->environment(), ['local', 'testing', 'staging'], true)
    );
}
```

Packages do NOT publish their own `TelescopeServiceProvider.php` (no
`app/Providers/` exists). They wire Telescope directly from the workbench
provider so it only runs when a developer is hacking on the package via
`testbench serve`. Consuming applications register their own.

### .gitignore

```gitignore
/public/vendor/telescope
```

### Telescope config — `config/telescope.php` key settings

```php
'enabled' => env('TELESCOPE_ENABLED', true),

'storage' => [
    'driver' => env('TELESCOPE_DRIVER', 'database'),
],

'queue' => [
    'connection' => env('TELESCOPE_QUEUE_CONNECTION', null),
    'queue'      => env('TELESCOPE_QUEUE', null),
],

// Prune entries older than 48 hours on local, 24 on staging
'prune' => [
    'hours' => env('TELESCOPE_PRUNE_HOURS', 48),
],
```

Add to `.env.example`:

```env
TELESCOPE_ENABLED=true
TELESCOPE_DRIVER=database
TELESCOPE_PRUNE_HOURS=48
TELESCOPE_ALLOWED_EMAILS=
```

---

## Laravel Debugbar

Visual in-browser toolbar showing queries, routes, views, logs, timing, memory, and
exceptions. Local only — controlled by `APP_DEBUG`.

### Installation

```bash
composer require fruitcake/laravel-debugbar --dev
php artisan vendor:publish --provider="Fruitcake\LaravelDebugbar\ServiceProvider"
```

Auto-discovered by Laravel. Enabled automatically when `APP_DEBUG=true`.

### .env

```env
# local .env
APP_DEBUG=true
DEBUGBAR_ENABLED=true
```

```env
# staging .env — disable explicitly
DEBUGBAR_ENABLED=false
```

### config/debugbar.php — key settings

Key `config/debugbar.php` settings are in `references/debug-configs.md`.

### Inline usage

Use the `Debugbar` facade or helper functions to log messages, measure time,
and track exceptions during development:

```php
use Debugbar;

// Log messages
Debugbar::info($object);
Debugbar::warning('Watch out...');
Debugbar::error('Something failed');

// Measure time
Debugbar::startMeasure('render', 'Time for rendering');
// ... code to measure ...
Debugbar::stopMeasure('render');

// Or with a closure
Debugbar::measure('My operation', function () {
    // expensive operation
});

// Log exceptions without throwing
try {
    // ...
} catch (Exception $e) {
    Debugbar::addThrowable($e);
}

// Helper functions (no facade needed)
debug($var1, $var2);           // dumps as debug message
start_measure('label');
stop_measure('label');
```

### .gitignore

```gitignore
/public/vendor/debugbar
```

---

---

## MCP Servers for Debug

Setup for the debug-related MCP servers (koriym/xdebug-mcp, @playwright/mcp,
laravel/boost) and the `.claude/settings.json` summary live in
`references/debug-configs.md`. Configure them from there.

## Completeness Checklist

```
DEBUG CONFIGURATION GATE
──────────────────────────────────────────────────────
[ ] Xdebug configured (php.ini or .env for Sail)
[ ] Xdebug port set to 9003
[ ] IDE path mapping configured
[ ] Telescope installed via composer require --dev
[ ] telescope:install and migrate run
[ ] TelescopeServiceProvider NOT in providers.php auto-load
[ ] Telescope registered in the project-type-appropriate provider (app → AppServiceProvider; module/package → WorkbenchServiceProvider) with env check
[ ] Gate restricts access to local + staging only
[ ] Sensitive headers and params hidden on staging
[ ] Staging filter limits recording to errors, slow queries, failures
[ ] TELESCOPE_ENABLED and allowed emails in .env.example
[ ] No Telescope or Xdebug configuration references APP_ENV=production
[ ] koriym/xdebug-mcp configured in .claude/settings.json
[ ] @playwright/mcp configured in .claude/settings.json
[ ] laravel/boost installed (--dev) and boost:install run
[ ] Debugbar installed as --dev dependency
[ ] DEBUGBAR_ENABLED=false in staging .env
[ ] Debugbar config published
──────────────────────────────────────────────────────
STATUS: [ ] PASS — opscale-test may proceed
        [ ] FAIL — list blocking items below
```

---

## Domain Rules

1. **Never production** — all three tools are `--dev` dependencies and environment-gated. Any config touching `APP_ENV=production` is a violation.
2. **Telescope registration is project-type-aware** — `app` projects register in `AppServiceProvider`; `module`/`package` projects have no `app/Providers/`, so register in `workbench/app/Providers/WorkbenchServiceProvider.php` instead. Never auto-registered in `bootstrap/providers.php`. Always conditional on `app()->environment(['local', 'staging'])` (plus `testing` for packages).
3. **Staging filter** — on staging, Telescope only records exceptions, failed requests, failed jobs, and slow queries. Full recording is local only.
4. **Sensitive data hidden on staging** — passwords, tokens, authorization headers always hidden outside local.
5. **Xdebug port 9003** — always 9003 (Xdebug 3 default). Never 9000 (conflicts with php-fpm).
