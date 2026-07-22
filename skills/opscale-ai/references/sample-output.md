# Sample output — opscale-ai

Anonymized excerpt derived from a working Opscale module
(`Unicoop/membresia`). Shows the SHAPE of what the skill produces,
not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body. The full original file lives in the source module.

> Note: the `membresia` module is a downstream consumer, not a
> publishable package — it has no shipped installer skill. The excerpt
> below was SYNTHESIZED from the membresia surface (composer.json,
> migrations, `config/loans.php`, NovaServiceProvider) following the
> shape opscale-ai prescribes.

---

```markdown
---
name: loans-setup
description: >
  Installs and configures the acme/loans Nova module in a host
  application. Walks the consumer through composer install, contract
  bindings, migrations, config publishing, and a seeded demo. Trigger:
  "install loans module", "set up acme/loans", "configure loans".
---

# loans-setup

## Purpose

Guides an interactive installation of `acme/loans` (Nova module —
loan admission + withdrawal). Reads the host's composer.json, asks
the consumer the questions needed to bind the cross-subdomain
contracts (`PartiesContract`, `UsersContract`), publishes config and
migrations, and runs the workbench seeder so the consumer can click
through a working flow before writing any code.

## Workflow

### Phase 1 — Discover the host application

1. Confirm the host is a Laravel app with Nova >=5.0 installed
   (read `composer.json`). Abort with a friendly error if not.
2. Detect existing `parties` and `users` modules. If absent, prompt
   the consumer to pick the binding strategy:
   - "I already have a Party module — bind to its resolver"
   - "Use the bundled stub resolver (workbench-style, for dev only)"
   - "I'll bind it later — just register the contract as abstract"
```
