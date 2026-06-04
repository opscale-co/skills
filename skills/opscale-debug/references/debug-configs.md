# Debug Tooling — Verbatim Configs

Full configuration blocks extracted from the opscale-debug body. Read the
relevant section when you reach that tool during setup.

Contents: TelescopeServiceProvider · config/debugbar.php · MCP Servers for Debug

---

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

---

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
