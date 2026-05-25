---
name: opscale-debug
description: >
  Generates the complete debug tooling configuration for an Opscale/Laravel Nova
  module — Xdebug setup and Laravel Telescope installation and configuration for
  local and staging environments. Use this skill whenever a module needs debug
  tooling set up, or when the user says "configure debug", "set up Telescope",
  "enable Xdebug", or "configure debugging". Applies to local and staging only —
  never production. This is Step 8 in the Opscale sequence, runs after opscale-logic
  and before opscale-test.
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

```php
<?php

namespace App\Providers;

use Illuminate\Support\Facades\Gate;
use Laravel\Telescope\IncomingEntry;
use Laravel\Telescope\Telescope;
use Laravel\Telescope\TelescopeApplicationServiceProvider;

class TelescopeServiceProvider extends TelescopeApplicationServiceProvider
{
    public function register(): void
    {
        Telescope::night();

        $this->hideSensitiveRequestDetails();

        Telescope::filter(function (IncomingEntry $entry) {
            if ($this->app->environment('local')) {
                return true;
            }

            // On staging: only record slow queries, exceptions, failed jobs, and requests
            return $entry->isReportableException()
                || $entry->isFailedRequest()
                || $entry->isFailedJob()
                || $entry->isScheduledTask()
                || $entry->hasMonitoredTag()
                || ($entry->type === 'query' && $entry->content['slow'] ?? false);
        });
    }

    protected function hideSensitiveRequestDetails(): void
    {
        if ($this->app->environment('local')) {
            return;
        }

        Telescope::hideRequestParameters(['_token', 'password', 'password_confirmation']);
        Telescope::hideRequestHeaders(['cookie', 'x-csrf-token', 'x-xsrf-token', 'authorization']);
    }

    protected function gate(): void
    {
        Gate::define('viewTelescope', function ($user) {
            if ($this->app->environment('local')) {
                return true;
            }

            if ($this->app->environment('staging')) {
                $allowed = explode(',', config('telescope.allowed_emails', ''));
                return in_array($user->email, array_map('trim', $allowed));
            }

            return false;
        });
    }
}
```

### Prevent Telescope from loading in production

In `app/Providers/AppServiceProvider.php`:

```php
public function register(): void
{
    if ($this->app->environment(['local', 'staging'])) {
        $this->app->register(TelescopeServiceProvider::class);
    }
}
```

And in `bootstrap/providers.php` — remove `TelescopeServiceProvider` from the
auto-registered list if it was added during install:

```php
// Remove this line from providers.php if present:
// App\Providers\TelescopeServiceProvider::class,

// It is manually registered in AppServiceProvider above
```

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

```php
'enabled' => env('DEBUGBAR_ENABLED', null), // null = follows APP_DEBUG

'collectors' => [
    'phpinfo'         => true,
    'messages'        => true,
    'time'            => true,
    'memory'          => true,
    'exceptions'      => true,
    'log'             => true,
    'db'              => true,   // queries + bindings + timing
    'views'           => true,
    'route'           => true,
    'events'          => false,  // enable when debugging event flows
    'cache'           => false,  // enable when debugging cache behavior
    'logs'            => false,
    'files'           => false,
    'config'          => false,
    'laravel'         => false,
],

'options' => [
    'db' => [
        'with_params'       => true,   // show query bindings
        'backtrace'         => true,   // show where queries originate
        'timeline'          => false,
        'explain'           => [
            'enabled' => false,        // enable to detect missing indexes
        ],
        'hints'             => false,
        'show_copy'         => true,
    ],
    'mail' => [
        'timeline'   => false,
        'show_body'  => true,
    ],
],
```

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

Three MCP servers augment the debug workflow for Claude Code. Configure them in
`.claude/settings.json` or your MCP client config.

---

### koriym/xdebug-mcp — AI-controlled Xdebug

Allows Claude Code to control Xdebug directly: set breakpoints, step through code,
and inspect variables without leaving the AI conversation.

**Requirement:** Xdebug must be installed and configured (see Xdebug section above).

```json
{
  "mcpServers": {
    "xdebug": {
      "command": "npx",
      "args": ["-y", "koriym-xdebug-mcp"]
    }
  }
}
```

**Use during debug when:**
- Tracing unexpected values inside an Opscale Action's `handle()` method
- Inspecting repository query results before they reach Nova
- Stepping through a BPMN task sequence to find where logic diverges

---

### @playwright/mcp — Browser automation for Nova UI verification

Allows Claude Code to interact with the running Nova application in the browser:
navigate, click, fill forms, take snapshots, and verify UI behavior after code changes.

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

For headed debug sessions (to see the browser):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--browser", "chromium"]
    }
  }
}
```

**Use during debug when:**
- Verifying that a Nova Resource displays the correct fields after domain changes
- Testing that a Nova Action form submits correctly and returns the expected response
- Checking Badge colors and field visibility after enum or status changes
- Capturing a screenshot of a broken UI state to correlate with backend errors

**Key tools available:**
- `browser_navigate` — open the Nova URL
- `browser_snapshot` — capture the accessibility tree (better than screenshot for debugging)
- `browser_click` / `browser_fill_form` — interact with Nova forms
- `browser_console_messages` — inspect JS errors
- `browser_network_requests` — inspect XHR/fetch calls to the Nova API

---

### laravel/boost — Laravel-specific AI context

Laravel-focused MCP server that gives Claude Code precise knowledge of the running
Laravel application: routes, models, config, logs, and more.

```bash
composer require laravel/boost --dev
php artisan boost:install
```

```json
{
  "mcpServers": {
    "laravel-boost": {
      "command": "php",
      "args": ["artisan", "boost:mcp"]
    }
  }
}
```

**Use during debug when:**
- Asking Claude Code to explain why a specific route is resolving unexpectedly
- Inspecting the current state of a model's attributes after a failed action
- Reviewing recent log entries correlated with a specific request
- Getting context about the application's current config before generating a fix

---

### MCP config summary (`.claude/settings.json`)

```json
{
  "mcpServers": {
    "xdebug": {
      "command": "npx",
      "args": ["-y", "koriym-xdebug-mcp"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    },
    "laravel-boost": {
      "command": "php",
      "args": ["artisan", "boost:mcp"]
    }
  }
}
```

> These three servers work together: **Boost** gives the AI context about the app,
> **Xdebug MCP** lets it trace PHP execution, and **Playwright MCP** lets it verify
> the result in the browser — all within a single Claude Code session.

---

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
[ ] Telescope manually registered in AppServiceProvider with env check
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
2. **Telescope via AppServiceProvider** — never auto-registered in `providers.php`. Always conditional on `app()->environment(['local', 'staging'])`.
3. **Staging filter** — on staging, Telescope only records exceptions, failed requests, failed jobs, and slow queries. Full recording is local only.
4. **Sensitive data hidden on staging** — passwords, tokens, authorization headers always hidden outside local.
5. **Xdebug port 9003** — always 9003 (Xdebug 3 default). Never 9000 (conflicts with php-fpm).
