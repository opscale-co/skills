---
name: opscale-ai
description: >
  Generates a Claude Code skill that ships with the project to facilitate its
  installation and configuration in a consuming application. The generated skill
  is an interactive version of the README — it asks the right config questions,
  runs migrations, creates seeders, installs complementary packages, and verifies
  everything works. This is NOT part of the development sequence — it runs
  independently, after the project is built. Trigger when the user says
  "generate installer skill", "create setup skill", "make this installable",
  or "generate AI config".
---

# opscale-ai

## Purpose

Generate a Claude Code skill that ships with the project and guides its
installation in a consuming application. Instead of reading a README and
running commands manually, the consumer invokes the skill and Claude Code
walks them through everything interactively.

The generated skill is essentially the README turned into a conversation:
- If there's a config file → ask the right questions and fill it in
- If there are migrations → run them and verify the schema
- If there are seeders needed → create them with appropriate data
- If there are complementary packages → install and configure them
- If there are env variables → ask for values and set them

**This is NOT part of the development sequence (Steps 0–10).** It runs
independently, after the project is published. The development sequence
produces the code; this skill produces the installer.

---

## Input Requirements

The project must be built and published (or ready to publish):
- `composer.json` exists with package name and dependencies
- `README.md` exists with installation instructions
- Source code exists in `src/`
- Config files exist (if publishable)
- Migrations exist (if the package has a database)
- Service providers exist

---

## Workflow

### Phase 1 — Analyze the project's installation surface

Read the project and identify everything a consumer needs to do:

```
Installation Surface Analysis:

Package: {vendor}/{package-slug}

1. Composer dependencies:
   - This package: {vendor}/{package-slug}
   - Complementary: {list of suggested/required companion packages}

2. Service Providers:
   - {ProviderClass} — {auto-discovered or manual registration}

3. Publishable config:
   - config/{slug}.php — {description of what it configures}
   - Config questions to ask the user:
     - {key}: {what this controls} — type: {string|bool|int|array}
     - ...

4. Migrations:
   - {count} migration files
   - Tables created: {list}
   - Depends on: {other tables that must exist}

5. Seeders needed:
   - {table}: {what data should be seeded — enum values, default records, etc.}

6. Environment variables:
   - {VAR_NAME}: {purpose} — required: {yes|no}
   - ...

7. Nova integration:
   - Resources to register: {list}
   - Menu items: {list}
   - Tool registration: {yes|no}

8. Post-install verification:
   - {check description}
   - ...

Generate installer skill?
```

Wait for confirmation.

---

### Phase 2 — Read the README

Parse the project's `README.md` to extract:
- Installation commands (composer require, artisan commands)
- Configuration instructions
- Usage examples
- Any manual steps the user must perform

The generated skill must cover everything the README covers, but interactively.

---

### Phase 3 — Generate the installer skill

Write `.claude/skills/{package-slug}-setup.md`:

```markdown
---
name: {package-slug}-setup
description: >
  Installs and configures {Package Name} in this Laravel application.
  Handles composer install, config setup, migrations, seeders, and
  verification. Trigger when the user says "install {package name}",
  "set up {package name}", or "add {package name}".
---

# {Package Name} Setup

## Prerequisites

Before starting, verify:
- Laravel application exists in the current directory
- Composer is available
- Database is accessible

If any prerequisite is missing, guide the user to set it up first.

## Step 1 — Install the package

```bash
composer require {vendor}/{package-slug}
```

{If there are complementary packages:}

Ask the user:
> "Do you also want to install {companion-package}? It provides {description}."

If yes:
```bash
composer require {vendor}/{companion-package}
```

## Step 2 — Publish configuration

```bash
php artisan vendor:publish --provider="{ProviderClass}"
```

Then open the published config file and ask the user for each configurable value:

{For each config key:}
> "{key}: {explanation of what this controls}. What value do you want?"
> Default: {default_value}

Write the user's answers to `config/{slug}.php`.

## Step 3 — Set environment variables

For each required env variable, ask:
> "{VAR_NAME}: {what this is for}. What's the value?"

Add to `.env`:
```env
{VAR_NAME}={user_value}
```

## Step 4 — Run migrations

```bash
php artisan migrate
```

Verify the tables were created:
{For each expected table:}
- [ ] `{table_name}` exists

## Step 5 — Create seeders (if needed)

{For each table that needs seed data:}

Generate a seeder at `database/seeders/{TableName}Seeder.php`:

```php
// Seed with {description of what data}
```

Ask the user:
> "Should I seed the {table} table with default data now?"

If yes:
```bash
php artisan db:seed --class={TableName}Seeder
```

## Step 6 — Register in Nova (if applicable)

{If the package has Nova resources or tools:}

Add to `NovaServiceProvider`:
```php
// Register resources, tools, menu items
```

## Step 7 — Verify installation

Run verification checks:
{For each check:}
- [ ] {description}

Report results to the user:
```
Installation complete:
✅ Package installed
✅ Config published and configured
✅ Migrations ran — {count} tables created
✅ Seeders executed
✅ Nova resources registered
```

If any check fails, explain what went wrong and how to fix it.
```

---

### Phase 4 — Register the skill in composer.json

Add to `composer.json` so the skill ships with the package:

```json
{
  "extra": {
    "claude": {
      "skills": [".claude/skills/{package-slug}-setup.md"]
    }
  }
}
```

Read `composer.json` first, merge the `extra.claude` key, write back.

---

### Phase 5 — Verify

```
AI CONFIGURATION CHECK
──────────────────────────────────────────────────────
[ ] .claude/skills/{package-slug}-setup.md exists
[ ] Skill covers all README installation steps
[ ] Skill asks for every config value
[ ] Skill asks for every env variable
[ ] Skill runs migrations
[ ] Skill creates seeders where needed
[ ] Skill installs complementary packages (with confirmation)
[ ] Skill has verification checklist
[ ] composer.json has extra.claude.skills reference
──────────────────────────────────────────────────────
```

---

## Domain Rules

1. **Not part of the build sequence** — this runs independently after Steps 0–10 are done.
2. **Interactive README** — the skill does everything the README says, but as a conversation.
3. **Ask, don't assume** — for every config value and env variable, ask the user. Never hardcode.
4. **Seeders are contextual** — only create seeders when the module needs initial data (enum records, default settings, sample data). Ask before seeding.
5. **Complementary packages are optional** — always ask before installing companion packages.
6. **Verify everything** — after each step, verify it worked before moving to the next.
