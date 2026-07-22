---
name: opscale-ai
description: >
  Generates an installer skill that ships with the project so it can be
  installed and configured by a downstream consumer. Independent of the
  development sequence — runs after the project is built. Trigger: "generate
  installer skill", "create setup skill", "make this installable".
  Use it whenever someone wants the project to be installable/configurable by a downstream consumer, even if they just say "make it installable". Not for building the project itself — that's the development skills.
---

# opscale-ai

## Context

### Purpose

Generate a Claude Code skill that ships with the project and guides its installation in a consuming application. Instead of reading a README and running commands manually, the consumer invokes the skill and Claude Code walks them through everything interactively.

The generated skill is essentially the README turned into a conversation:
- If there's a config file → ask the right questions and fill it in
- If there are migrations → run them and verify the schema
- If there are seeders needed → create them with appropriate data
- If there are complementary packages → install and configure them
- If there are env variables → ask for values and set them

**This is NOT part of the development sequence (Steps 0–13).** It runs independently, after the project is published. The development sequence produces the code; this skill produces the installer. The `PROJECT_TYPE` written by `opscale-init` into `.specify/memory/constitution.md` determines what the installer must cover (app vs module vs package vs library) — cross-link there for downstream consumer expectations.

### Input requirements

The project must be built and published (or ready to publish):
- `composer.json` exists with package name and dependencies
- `README.md` exists with installation instructions
- Source code exists in `src/`
- Config files exist (if publishable)
- Migrations exist (if the package has a database)
- Service providers exist

### Output structure of the generated installer skill

Writes `.claude/skills/{package-slug}-setup.md`. The installer skill must mirror everything the README says but ask the user instead of assuming:

- composer install (and optional companion packages)
- publish config (and ask for each key)
- env variables (ask for each value)
- run migrations
- create seeders where needed (with confirmation)
- register in Nova (if applicable)
- verify installation and report results

The skill is also registered in `composer.json` so it ships with the package:

```json
{
  "extra": {
    "claude": {
      "skills": [".claude/skills/{package-slug}-setup.md"]
    }
  }
}
```

### Domain Rules

1. **Not part of the build sequence** — this runs independently after Steps 0–13 are done.
2. **Interactive README** — the skill does everything the README says, but as a conversation.
3. **Ask, don't assume** — for every config value and env variable, ask the user. Never hardcode.
4. **Seeders are contextual** — only create seeders when the module needs initial data (enum records, default settings, sample data). Ask before seeding.
5. **Complementary packages are optional** — always ask before installing companion packages.
6. **Verify everything** — after each step, verify it worked before moving to the next.

## Steps

### Phase 1 — Inventory existing artifacts + project type

Read the project and identify everything a consumer needs to do. Cross-link `PROJECT_TYPE` from `.specify/memory/constitution.md` — the type changes what the installer covers (apps don't need composer require; modules need Nova provider registration; libraries skip migrations).

```
Installation Surface Analysis:

Package: {vendor}/{package-slug}
Project type: {app | module | package | library}

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
```

Then parse the project's `README.md` to extract installation commands (composer require, artisan commands), configuration instructions, usage examples, and any manual steps the downstream consumer performs. The generated skill must cover everything the README covers, but interactively.

**Wait for user approval before continuing.**

### Phase 2 — Propose installer skill structure

Draft the installer skill outline before writing the file. Confirm the section breakdown with the user — at minimum:

```
Proposed installer skill: .claude/skills/{package-slug}-setup.md

Steps:
  1. Prerequisites check (Laravel app, composer, DB)
  2. composer require {vendor}/{package-slug} (+ confirm companions)
  3. Publish + configure config/{slug}.php (one question per key)
  4. Set environment variables (one question per var)
  5. Run migrations + verify tables
  6. Create + run seeders (with confirmation)
  7. Register in Nova (if applicable)
  8. Verify installation + report
```

Confirm the question wording for each config key and env var with the user — the questions are the installer's user interface.

**Wait for user approval before continuing.**

### Phase 3 — Generate `.claude/skills/{slug}-setup.md`

Write the installer skill:

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

\`\`\`bash
composer require {vendor}/{package-slug}
\`\`\`

{If there are complementary packages, ask the user before installing each.}

## Step 2 — Publish configuration

\`\`\`bash
php artisan vendor:publish --provider="{ProviderClass}"
\`\`\`

For each config key, ask the user for the value (default: {default_value}).

## Step 3 — Set environment variables

For each required env variable, ask:
> "{VAR_NAME}: {what this is for}. What's the value?"

Add to `.env`.

## Step 4 — Run migrations

\`\`\`bash
php artisan migrate
\`\`\`

Verify the tables were created.

## Step 5 — Create seeders (if needed)

For each table that needs seed data, generate a seeder and ask the user before running.

## Step 6 — Register in Nova (if applicable)

Add to `NovaServiceProvider` — resources, tools, menu items.

## Step 7 — Verify installation

Run verification checks and report results to the user.
```

Then register the skill in `composer.json` (merge `extra.claude.skills`):

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

**Wait for user approval before continuing.**

### Phase 4 — Self-install dry run

Verify the generated installer is well-formed and reads cleanly:

```
AI CONFIGURATION CHECK
[ ] .claude/skills/{package-slug}-setup.md exists
[ ] Skill covers all README installation steps
[ ] Skill asks for every config value
[ ] Skill asks for every env variable
[ ] Skill runs migrations
[ ] Skill creates seeders where needed
[ ] Skill installs complementary packages (with confirmation)
[ ] Skill has verification checklist
[ ] composer.json has extra.claude.skills reference
```

Then run the installer skill against a scratch Laravel app (or dry-run mentally if no scratch app is available) and walk every prompt to confirm:

- every question maps to a real config key or env var
- the commands execute without error in order
- the verification step reports green when everything is in place
- the verification step fails loudly when anything is missing

**Wait for user approval before continuing.**

## Sample

Generated installer skill excerpt — see `references/sample-output.md`.

## Success condition

```bash
node skills/opscale-ai/scripts/validate-installer.mjs --installer-file=.claude/skills/{slug}-setup.md
```

Exit code 0 = pass.
