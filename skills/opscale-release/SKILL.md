---
name: opscale-release
description: >
  Configures the complete release pipeline for an Opscale/Laravel Nova package:
  Semantic Release with Packagist publishing, SonarQube quality gates, commitlint
  and Husky for commit convention enforcement, lint-staged for pre-commit checks,
  and four GitHub Actions workflows. Use this skill when the user says "configure
  release", "set up semantic release", "add SonarQube", "configure the release
  pipeline", or "set up commit hooks". This is Step 10 in the Opscale sequence,
  runs after opscale-test.
---

# opscale-release

## Purpose

Configure automated versioning, changelog generation, Packagist publishing, and code
quality gates so every merge to main produces a correctly versioned, documented,
quality-verified package release.

Read the reference files in `references/` before generating any config — they are
the authoritative templates for this skill.

---

## Reference Files

```
references/
├── .releaserc.json                          — Semantic Release config
├── commitlint.config.mjs                    — Commit message rules
├── lint-staged.config.mjs                   — Pre-commit hooks
├── duster.json                              — Duster linting config
├── pint.json                                — PHP style rules (Pint preset)
├── rector.php                               — Rector modernization config
├── sonar-project.properties                 — SonarQube project config
├── README.md                                — Package README template
└── .github/
    └── workflows/
        ├── auto-check.yml                   — Quality gates on PR to develop
        ├── auto-refactor.yml                — Rector check on PR to develop
        ├── auto-update.yml                  — Dependabot auto-merge
        ├── publish-package.yml              — Release workflow for PACKAGES
        └── deploy-app.yml                   — Release workflow for APPS (Vapor + develop sync)
```

**Release workflow selection — choose ONE based on project type:**

| Project type | Workflow to use | Description |
|---|---|---|
| **Laravel package** (published to Packagist) | `publish-package.yml` | Bumps `composer.json`, triggers Packagist webhook |
| **Laravel application** (deployed to server/Vapor) | `deploy-app.yml` | Runs Semantic Release + deploys via Vapor, merges back to `develop` |


Copy the chosen file to `.github/workflows/` and replace the `[placeholder]` tokens listed below.

---

## Installation

```bash
# Semantic Release + plugins
npm install --save-dev semantic-release \
    @semantic-release/changelog \
    @semantic-release/git \
    @semantic-release/github \
    @semantic-release/exec

# Commit convention enforcement
npm install --save-dev @commitlint/cli @commitlint/config-conventional

# Pre-commit hooks
npm install --save-dev husky lint-staged
npx husky init

# Rector Laravel extension
composer require --dev rector/rector rector/rector-laravel
```

### Husky hooks

After `npx husky init`, create two hook files:

**`.husky/commit-msg`**
```bash
#!/bin/sh
npx --no -- commitlint --edit "$1"
```

**`.husky/pre-commit`**
```bash
#!/bin/sh
npx lint-staged
```

---

## Tokens to Replace

After copying the reference files, replace these tokens:

| File | Token | Replace with |
|------|-------|-------------|
| `sonar-project.properties` | `[package-name]` | Composer package name e.g. `opscale-co/loan-module` |
| `sonar-project.properties` | `[Package Display Name]` | Human name e.g. `Opscale Loan Module` |
| `.releaserc.json` | `changelogTitle` | Update to reflect the actual package name |
| `README.md` | `[MODULE_DESCRIPTION]` | One-line description of what the module does |
| `README.md` | `[PACKAGE_SLUG]` | Composer package slug e.g. `nova-loan-module` |
| `README.md` | `[PACKAGE_NAMESPACE]` | PHP namespace segment e.g. `LoanModule` |


---

## What Each File Does

**`.releaserc.json`**
Semantic Release config. On push to `main`:
1. Analyzes commits since last release to determine version bump
2. Generates release notes from conventional commits
3. Updates `CHANGELOG.md`
4. Bumps `version` in `composer.json` via `jq` (`@semantic-release/exec`)
5. Triggers Packagist webhook to publish the new version
6. Creates GitHub release and tags
7. Commits `CHANGELOG.md` + `composer.json` + `package.json` back to `main`

**`duster.json`**
Duster runs Pint (PHP style) and ESLint (JS/Vue). PHPStan is disabled — it runs
separately via `phpstan analyse`. Includes `src`, `tests`, `workbench/app`.
Excludes `tests/fixtures`.

**`rector.php`**
Rector modernization with `laravelSetup()`: PHP 8.3 sets, code quality, naming,
dead code, type declarations, PHPUnit 110, and Laravel 110 sets.
Cache stored at `/tmp/rector-cache`.

**`lint-staged.config.mjs`**
Runs `duster fix` on staged PHP and JS/Vue/TS files at `git commit` time.
PHPStan is intentionally excluded — too slow for pre-commit, runs in CI instead.

**`commitlint.config.mjs`**
Enforces Conventional Commits. Allowed types: feat, fix, docs, style, refactor,
perf, test, chore, revert, build, ci. Scope must be kebab-case.

**`README.md`**
Standardized Opscale package README. Replace `[MODULE_DESCRIPTION]`, `[PACKAGE_SLUG]`,
and `[PACKAGE_NAMESPACE]` with the module-specific values. Structure is fixed — do not
reorder or remove sections.

**`sonar-project.properties`**
Points SonarQube at `src/` and `tests/`. Reads `coverage.xml` and `phpstan-report.json`.
`sonar.qualitygate.wait=true` blocks CI if the gate fails.

**`.github/workflows/auto-check.yml`**
Runs on PR to `develop`. Three gates: Duster lint → SonarQube scan + quality gate →
Pest tests with coverage. Summary at the end. Fails fast on lint or test failures.

**`.github/workflows/auto-refactor.yml`**
Runs on PR to `develop`. Runs Rector dry-run. If changes found: applies them,
comments the diff on the PR, then fails the check to force the author to apply
changes locally and commit.

**`.github/workflows/auto-update.yml`**
Auto-merges Dependabot PRs for patch and minor updates. Comments on major updates
requesting manual review.

**`.github/workflows/publish-package.yml`** — for packages
Runs on push to `main`. Installs deps (including Nova via `NOVA_USERNAME` +
`NOVA_LICENSE_KEY`), then runs `npx semantic-release`.

**`.github/workflows/deploy-app.yml`** — for applications
Runs on push to `main` (and `next`, `beta`, `*.x` maintenance branches).
Runs Semantic Release via `VAPOR_API_TOKEN` for deployment to Laravel Vapor.
Includes a `update-develop` job that merges `main` back into `develop` and syncs
the version in `composer.json` after each release.

---

## Required Repository Secrets

Configure these in GitHub → Settings → Secrets and variables → Actions:

| Secret | Description |
|--------|-------------|
| `GH_TOKEN` | GitHub PAT with `contents: write` — used by Semantic Release |
| `PACKAGIST_USERNAME` | Packagist account username |
| `PACKAGIST_TOKEN` | Packagist API token |
| `NOVA_USERNAME` | Nova license email (for composer install in CI) |
| `NOVA_LICENSE_KEY` | Nova license key |
| `SONAR_TOKEN` | SonarQube authentication token |
| `SONAR_HOST_URL` | SonarQube server URL |

---

## package.json scripts

```json
{
    "scripts": {
        "lint": "duster lint",
        "lint:fix": "duster fix",
        "test": "pest",
        "test:unit": "pest --testsuite=Unit",
        "test:feature": "pest --testsuite=Feature",
        "test:web": "pest --testsuite=Web",
        "test:coverage": "pest --coverage --min=80",
        "analyse": "phpstan analyse",
        "analyse:report": "phpstan analyse --error-format=json > phpstan-report.json || true",
        "refactor": "rector --dry-run",
        "refactor:apply": "rector",
        "release:dry": "semantic-release --dry-run",
        "quality": ["@lint", "@analyse", "@test"]
    }
}
```

---

## Commit Convention

| Type | Release | Use for |
|------|---------|---------|
| `feat` | minor | New feature |
| `fix` | patch | Bug fix |
| `perf` | patch | Performance improvement |
| `refactor` | patch | Code restructure |
| `revert` | patch | Revert a commit |
| `docs` | none | Documentation |
| `style` | none | Formatting |
| `chore` | none | Build, deps, tooling |
| `test` | none | Tests |
| `build` | none | Build system |
| `ci` | none | CI config |
| `BREAKING CHANGE` | major | In scope field |

---

## Completeness Checklist

```
RELEASE CONFIGURATION GATE
──────────────────────────────────────────────────────
[ ] .releaserc.json present (changelog title updated)
[ ] commitlint.config.mjs present
[ ] .husky/commit-msg runs commitlint
[ ] .husky/pre-commit runs lint-staged
[ ] lint-staged.config.mjs runs duster fix only (no phpstan)
[ ] duster.json present with workbench/app included
[ ] rector.php present with laravelSetup() function
[ ] sonar-project.properties present ([package-name] token replaced)
[ ] .github/workflows/auto-check.yml present
[ ] .github/workflows/auto-refactor.yml present
[ ] .github/workflows/auto-update.yml present
[ ] .github/workflows/publish-package.yml present (packages) OR deploy-app.yml present (apps) — never both
[ ] All 7 repository secrets configured
[ ] jq installed in CI (ubuntu-latest has it pre-installed)
──────────────────────────────────────────────────────
STATUS: [ ] PASS — opscale-ai may proceed
        [ ] FAIL — list blocking items below
```

---

## Domain Rules

1. **Semantic versioning is automated** — never bump versions manually.
2. **Every commit follows Conventional Commits** — enforced by commitlint via Husky.
3. **Duster on pre-commit, PHPStan in CI** — pre-commit is fast (style only), CI is thorough.
4. **PRs to `develop` pass all three gates** — Duster, SonarQube, and tests before merge.
5. **Rector failures block PRs** — authors must apply `vendor/bin/rector process` locally.
6. **Packagist updates automatically** — `@semantic-release/exec` triggers the webhook.
7. **Dependabot patch/minor auto-merges** — major requires manual review.
