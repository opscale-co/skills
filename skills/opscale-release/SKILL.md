---
name: opscale-release
description: >
  Configures the deployment/release CI — SonarQube, GitHub Actions workflows,
  and the semantic-release pipeline that versions and publishes. The Review
  phase — after Generate (domain/logic/ui) has produced the tests. Trigger:
  "configure release", "set up CI", "wire SonarQube", "set up the deploy
  pipeline". Use it whenever the release/CI pipeline or quality gates need
  configuring, even loosely phrased. Not for commit/linter/debug/harness
  configs — those are opscale-init.
---

# opscale-release

## Context

### Purpose

Configure SonarQube and the GitHub Actions workflows so every merge produces a quality-verified, deployable release. Versioning, changelog, and publishing run on `semantic-release`, whose config (`.releaserc.json`, commitlint, the commit-msg hook) was already established by `opscale-init`; this skill wires the CI that invokes it.

**Linter config (Duster, Pint, Rector, Larastan baseline, lint-staged, ESLint) is installed by `opscale-init` on day 1 — this skill only adds the CI workflows that invoke them.** If a project reaches this step without the linter configs in place, stop and re-run `/opscale-init` first.

### Prerequisites — tests MUST exist

| # | Requirement | Check | If missing |
|---|-------------|-------|-----------|
| 1 | `opscale-init` has been run | `.specify/memory/constitution.md` exists | Stop. Run `/opscale-init`. |
| 2 | The Generate phase produced tests | `tests/Unit/` (opscale-domain), `tests/Feature/` (opscale-logic), and `tests/Browser/` (opscale-ui) contain at least one test class each (for `app`/`module`/`package`); `tests/` populated for `library` | Stop. Run the Generate phase (`/opscale-domain` → `/opscale-logic` → `/opscale-ui`) — semantic-release will not gate a release without a test suite. |
| 3 | `composer run check` passes locally | Run it | Fix failures before configuring release pipeline. |

This skill belongs to the **Review phase**. Inside Review the order is fixed: **`release` always runs after `test`**.

### Reference files

```
references/
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

Linter configuration files (`duster.json`, `pint.json`, `rector.php`, `phpstan.neon`, `lint-staged.config.mjs`, `.eslintrc.cjs`) live in `opscale-init/references/`. They were copied into the project by `opscale-init` Step 4d.

**Release workflow selection — choose ONE based on project type:**

| Project type | Workflow to use | Description |
|---|---|---|
| **Laravel package** (published to Packagist) | `publish-package.yml` | Bumps `composer.json`, triggers Packagist webhook |
| **Laravel application** (deployed to server/Vapor) | `deploy-app.yml` | Runs Semantic Release + deploys via Vapor, merges back to `develop` |

Copy the chosen file to `.github/workflows/` and replace the `[placeholder]` tokens.

### What each file does

- **`.releaserc.json` / commitlint** — configured by `opscale-init`; this skill only wires the CI workflows that invoke `semantic-release`.
- **Linter configs** — installed by `opscale-init` Step 4d. The CI workflows below invoke these same configs in PRs.
- **Static analysis (PHPStan + Larastan)** — the deployment gate runs `phpstan analyse` against the `phpstan.neon` baseline written by `opscale-init` (level 8). SonarQube reads its report. A static-analysis failure blocks the release.
- **`README.md`** — standardized Opscale package README. Replace `[MODULE_DESCRIPTION]`, `[PACKAGE_SLUG]`, `[PACKAGE_NAMESPACE]`. Structure is fixed.
- **`sonar-project.properties`** — points SonarQube at `src/` and `tests/`. Reads `coverage.xml` and `phpstan-report.json`. `sonar.qualitygate.wait=true` blocks CI if the gate fails.
- **`auto-check.yml`** — runs on PR to `develop`. Three gates: Duster lint → SonarQube scan + quality gate → Pest tests with coverage. Fails fast on lint or test failures.
- **`auto-refactor.yml`** — runs on PR to `develop`. Runs Rector dry-run. If changes found: applies them, comments the diff on the PR, then fails the check.
- **`auto-update.yml`** — auto-merges Dependabot PRs for patch and minor updates. Comments on major updates.
- **`publish-package.yml`** (packages) — runs on push to `main`. Installs deps (including Nova via `NOVA_USERNAME` + `NOVA_LICENSE_KEY`), then runs `npx semantic-release`.
- **`deploy-app.yml`** (applications) — runs on push to `main` (and `next`, `beta`, `*.x` maintenance branches). Deploys via `VAPOR_API_TOKEN`. Includes `update-develop` job that merges `main` back into `develop` and syncs the version in `composer.json`.

### Tokens to replace

After copying the reference files, replace these tokens:

| File | Token | Replace with |
|------|-------|-------------|
| `sonar-project.properties` | `[package-name]` | Composer package name e.g. `opscale-co/loan-module` |
| `sonar-project.properties` | `[Package Display Name]` | Human name e.g. `Opscale Loan Module` |
| `.releaserc.json` | `changelogTitle` | Update to reflect the actual package name |
| `README.md` | `[MODULE_DESCRIPTION]` | One-line description of what the module does |
| `README.md` | `[PACKAGE_SLUG]` | Composer package slug e.g. `nova-loan-module` |
| `README.md` | `[PACKAGE_NAMESPACE]` | PHP namespace segment e.g. `LoanModule` |

### Required repository secrets

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

### Commit convention

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

### Domain Rules

1. **Semantic versioning is automated** — never bump versions manually.
2. **Every commit follows Conventional Commits** — enforced by the commit-msg hook configured in `opscale-init`.
3. **Duster on pre-commit, PHPStan in CI** — pre-commit is fast (style only), CI is thorough.
4. **PRs to `develop` pass all three gates** — Duster, SonarQube, and tests before merge.
5. **Rector failures block PRs** — authors must apply `vendor/bin/rector process` locally.
6. **Packagist updates automatically** — `@semantic-release/exec` triggers the webhook.
7. **Dependabot patch/minor auto-merges** — major requires manual review.

## Steps

### Phase 1 — Verify tests exist (prerequisite)

Confirm prerequisites: `.specify/memory/constitution.md` exists; `tests/Unit/`, `tests/Feature/`, and `tests/Browser/` each contain at least one test class for `app`/`module`/`package` projects (or `tests/` populated for `library`). Run `composer run check` locally and fix any failures before proceeding.

If any prerequisite is missing, stop and direct the user back to `opscale-init` or the Generate phase (domain/logic/ui).

**Wait for user approval before continuing.**

### Phase 2 — Wire CI workflows (choose publish-package.yml OR deploy-app.yml)

Copy the always-on workflows to `.github/workflows/`:

- `auto-check.yml`
- `auto-refactor.yml`
- `auto-update.yml`

Then choose **exactly one** release workflow based on project type:

- **Laravel package** (Packagist) → `publish-package.yml`
- **Laravel application** (Vapor) → `deploy-app.yml`

Never copy both. Read `.specify/memory/constitution.md` to confirm `PROJECT_TYPE`.

Also confirm `package.json` carries the standard release-related scripts:

```json
{
    "scripts": {
        "lint": "duster lint",
        "lint:fix": "duster fix",
        "test": "pest",
        "test:unit": "pest --testsuite=Unit",
        "test:feature": "pest --testsuite=Feature",
        "test:browser": "pest -c phpunit.dusk.xml",
        "analyse": "phpstan analyse",
        "analyse:report": "phpstan analyse --error-format=json > phpstan-report.json || true",
        "refactor": "rector --dry-run",
        "refactor:apply": "rector",
        "release:dry": "semantic-release --dry-run",
        "quality": ["@lint", "@analyse", "@test"]
    }
}
```

No PHP or npm installs are needed at this step — Duster, Pint, Rector, Larastan, Pest, lint-staged, and ESLint were all installed by `opscale-init` Step 4d. The `commit-msg` hook (commitlint) and the **pre-commit** hook (running `lint-staged`) were also configured by `opscale-init`.

**Wait for user approval before continuing.**

### Phase 3 — SonarQube setup with token replacement

Copy `sonar-project.properties` from `references/` to the project root. Replace tokens:

- `[package-name]` → composer package name (e.g. `opscale-co/loan-module`)
- `[Package Display Name]` → human name (e.g. `Opscale Loan Module`)

Confirm the repository has both secrets configured in GitHub → Settings → Secrets and variables → Actions:

- `SONAR_TOKEN` — SonarQube authentication token
- `SONAR_HOST_URL` — SonarQube server URL

Verify all 7 secrets listed in Context → Required repository secrets are present in the repo settings. Missing secrets will silently break CI.

**Completeness checklist** (verify all before declaring the skill complete):

```
RELEASE CONFIGURATION GATE
[ ] .releaserc.json + commit-msg hook + .husky/pre-commit present (from opscale-init)
[ ] Linter configs present from opscale-init (duster.json, pint.json, rector.php, phpstan.neon, lint-staged.config.mjs)
[ ] sonar-project.properties present ([package-name] token replaced)
[ ] .github/workflows/auto-check.yml present
[ ] .github/workflows/auto-refactor.yml present
[ ] .github/workflows/auto-update.yml present
[ ] .github/workflows/publish-package.yml present (packages) OR deploy-app.yml present (apps) — never both
[ ] All 7 repository secrets configured
[ ] jq installed in CI (ubuntu-latest has it pre-installed)
```

**Wait for user approval before continuing.**

### Phase 4 — Verify with semantic-release --dry-run

Run a final verification to confirm semantic-release can read the commit history and would emit a valid release plan:

```bash
npx semantic-release --dry-run
```

The dry-run should report:
- detected commit types
- the next version it would publish
- the changelog entries it would generate

If the dry-run fails (missing config, unrecognized branch, broken commit history), stop and fix before declaring the skill complete.

**Wait for user approval before continuing.**

## Sample

`auto-check.yml` + composer scripts + `sonar-project.properties` — see `references/sample-output.md`.

## Success condition

```bash
node scripts/validate-release.mjs --project-root=.
```

Exit code 0 = pass.
