## Support us

Support Opscale

At Opscale, we're passionate about contributing to the open-source community by providing solutions that help businesses scale efficiently. If you've found our tools helpful, here are a few ways you can show your support:

⭐ **Star this repository** to help others discover our work and be part of our growing community. Every star makes a difference!

💬 **Share your experience** by leaving a review on [Trustpilot](https://www.trustpilot.com/review/opscale.co) or sharing your thoughts on social media. Your feedback helps us improve and grow!

📧 **Send us feedback** on what we can improve at [feedback@opscale.co](mailto:feedback@opscale.co). We value your input to make our tools even better for everyone.

🙏 **Get involved** by actively contributing to our open-source repositories. Your participation benefits the entire community and helps push the boundaries of what's possible.

💼 **Hire us** if you need custom dashboards, admin panels, internal tools or MVPs tailored to your business. With our expertise, we can help you systematize operations or enhance your existing product. Contact us at hire@opscale.co to discuss your project needs.

Thanks for helping Opscale continue to scale! 🚀

## Description

Claude Code skills and subagents for building Laravel projects with a structured, spec-driven workflow. Works with new and existing projects.

This workflow is built around Claude Code harness best practices: dividing work into specialized skills and subagents, each with a focused scope and limited tools, to maximize precision and reduce hallucination. Instead of one monolithic prompt, the harness orchestrates small, composable units that do one thing well. For architecture, it follows the conventions already defined by [Opscale](https://github.com/opscale-co) for Laravel + Nova projects. For methodology, it implements [spec-driven development](https://github.com/spec-driven) — artifacts are validated before any code is generated.

## How It Works

The harness splits every project into three phases. Each phase is a group of skills that orchestrate specialized subagents. No phase starts until the previous one is validated.

```
Plan → Generate → Review
```

### Plan — understand before building

Skills: `opscale-process` → `opscale-dbml` → `opscale-bpmn`

The planning phase produces validated spec artifacts — not code. Each skill takes informal input, structures it, spawns validator subagents, and only advances when the artifact passes.

- **Process** — business spec from informal input (actors, rules, triggers, conditions)
- **DBML** — DDD-aligned data model from the spec (entities, enums, relationships)
- **BPMN** — process map from the spec and data model (task classification, data flow)

Every artifact is cross-validated: the BPMN references only entities from the DBML, the DBML traces back to the spec. Nothing is invented.

### Generate — deterministic code from validated artifacts

Skills: `opscale-domain` → `opscale-ui` → `opscale-logic`

With validated artifacts as input, each skill spawns parallel subagents — one per unit of work. Generation is deterministic: same input always produces the same output.

- **Domain** — models, migrations, enums, value objects, repositories (one subagent per entity)
- **UI** — Nova resources, field traits, repeatables (one subagent per aggregate)
- **Logic** — Opscale Actions (one subagent per business rule)

Package projects enter directly here — the user provides definitions instead of spec artifacts. The same subagents run with the same contracts.

### Review — quality gates before shipping

Skills: `opscale-debug` → `opscale-test` → `opscale-release`

The review phase runs enforcement and testing subagents sequentially. Nothing merges without passing all gates.

- **Debug** — development tooling configuration
- **Test** — Pest tests (unit, feature, web), PHPStan level 8, Duster lint, Rector
- **Release** — Semantic Release, CI/CD workflows, SonarQube

## Project Types

| Type | Description | Pipeline | Example |
|------|-------------|----------|---------|
| `app` | Complete Laravel Nova application with many modules | Full spec-driven (per module) | A multi-module SaaS platform |
| `module` | Bounded-context package within an app | Full spec-driven | `opscale-co/nova-loan-module` |
| `package` | Standalone project with specific functionality | Direct (domain/ui/logic without specs) | `nova-api`, `nova-authorization` |
| `library` | Pure utility/infrastructure code | Test + release only | `opscale-co/strict-rules` |

### Development Sequences

```
app / module    init → plan → generate → review
package         init → generate → review
library         init → review
```

**app/module** get the full pipeline: plan the spec artifacts, generate code from them, review with quality gates. **package** skips the planning phase — definitions are provided directly. **library** has no generation phase — just code, tests, and release.

## New and Existing Projects

The workflow is designed for both greenfield and existing codebases.

### New Projects

Run `opscale-init`, then follow the sequence from step 1. Each step produces a validated artifact that the next step depends on.

### Existing Projects

`opscale-init` scans the existing code structure — models, migrations, Nova resources, Actions, tests — and recommends where to join the sequence:

| What already exists | Recommended entry point |
|---------------------|------------------------|
| Nothing | Step 1: `opscale-process` |
| Business docs but no code | Step 1: `opscale-process` (formalize into spec) |
| Models + migrations but no spec | Step 1: `opscale-process` (reverse-document what exists) |
| Full domain + Nova but no tests | Step 8: `opscale-test` |
| Everything, adopting conventions | Run `constitution-enforcer` to assess |

Generation agents detect existing files at every target path:
- **Identical** → skip
- **Existing file has additions** → merge, preserving custom code
- **Conflict** → flag for review, never silently overwrite

Existing code is the source of truth until the spec catches up. Adoption can be incremental — one module at a time.

## Installer Skill (`opscale-ai`)

Separate from the development sequence. `opscale-ai` generates a Claude Code skill that ships with the project and guides its installation in a consuming application — an interactive version of the README.

When a consumer installs the package, instead of reading the README they invoke the skill and Claude Code walks them through everything:
- Asks the right questions for each config value
- Runs migrations and verifies the schema
- Creates seeders with appropriate data when needed
- Installs and configures complementary packages (with confirmation)
- Sets environment variables
- Registers Nova resources if applicable
- Runs a verification checklist at the end

## Architecture

```
skills/        → 11 skills (orchestrators — own workflow and user dialogue)
agents/        → 24 agents (execution units — own parallelizable work)
```

Skills manage the sequence, interact with the user, and spawn agents. Agents do the actual work — generating files, running validators, checking gates — in parallel where possible. Agents receive normalized input from the skill and generate code independently.

### MCP Servers

Agents use three MCP servers configured by `opscale-init`:

| Server | Used by | Purpose |
|--------|---------|---------|
| `sequential-thinking` | Code generation agents | Step-by-step reasoning for complex logic implementation |
| `sqlite` | Test and quality agents | Structured test results and coverage tracking |
| `memory` | All agents | Persistent knowledge graph across sessions |

### Skills

#### Development Sequence

| Step | Skill | Purpose | app | module | package | library |
|------|-------|---------|:---:|:------:|:-------:|:-------:|
| 0 | `opscale-init` | Bootstrap scaffold, constitution + MCP servers | Yes | Yes | Yes | Yes |
| 1 | `opscale-process` | Business spec from informal input | Per module | Yes | -- | -- |
| 2 | `opscale-dbml` | DDD-aligned DBML data model | Per module | Yes | -- | -- |
| 3 | `opscale-bpmn` | BPMN 2.0 process map | Per module | Yes | -- | -- |
| 4 | `opscale-domain` | Models, migrations, enums, repos, VOs | Per module | Yes | Yes | -- |
| 5 | `opscale-ui` | Resources, Repeatables, field traits | Per module | Yes | Yes | -- |
| 6 | `opscale-logic` | Opscale Actions | Per module | Yes | Yes | -- |
| 7 | `opscale-debug` | Xdebug, Telescope, Debugbar, MCP | Yes | Yes | Yes | Optional |
| 8 | `opscale-test` | Pest, PHPStan, Duster, Rector | Yes | Yes | Yes | Yes |
| 9 | `opscale-release` | Semantic Release, CI/CD workflows | deploy-app | publish-package | publish-package | publish-package |

#### Independent

| Skill | Purpose | app | module | package | library |
|-------|---------|:---:|:------:|:-------:|:-------:|
| `opscale-ai` | Generate installer skill for consuming apps | -- | Yes | Yes | Yes |

### Agents

#### Validation (app, module)

Require spec documentation artifacts (spec.md, data-model.md, process.md).

| Agent | Spawned by | Purpose |
|-------|-----------|---------|
| `dbml-validator` | opscale-dbml | Runs validate-dbml.mjs, returns pass/fail |
| `bpmn-validator` | opscale-bpmn | Runs validate-bpmn.mjs, returns pass/fail |
| `spec-consistency-checker` | opscale-bpmn | Cross-references spec / DBML / BPMN |

#### Domain Generation (app, module, package)

Agents receive normalized input from the skill. All parallelizable.

| Agent | Spawned by | Unit |
|-------|-----------|------|
| `enum-generator` | opscale-domain | One per enum |
| `value-object-generator` | opscale-domain | One per VO |
| `migration-generator` | opscale-domain | One per entity |
| `model-generator` | opscale-domain | One per entity |
| `repository-generator` | opscale-domain | One per model (trait with scopes + boot hooks) |

#### Nova Generation (app, module, package)

| Agent | Spawned by | Unit |
|-------|-----------|------|
| `resource-generator` | opscale-ui | One per aggregate root |
| `field-trait-generator` | opscale-ui | One per aggregate |
| `repeatable-generator` | opscale-ui | One per nested collection |

#### Logic Generation (app, module, package)

| Agent | Spawned by | Unit |
|-------|-----------|------|
| `action-generator` | opscale-logic | One per Action — receives normalized input from skill |

#### Test Generation

| Agent | app | module | package | library | What it tests |
|-------|:---:|:------:|:-------:|:-------:|---------------|
| `unit-test-generator` | Yes | Yes | Yes | -- | VOs, enums, models, repos, schema consistency |
| `feature-test-generator` | Yes | Yes | Yes | -- | Actions with real DB, events, side effects |
| `web-test-generator` | Yes | Yes | Yes | -- | Complete user flow through Nova UI |
| `support-test-generator` | -- | -- | -- | Yes | Traits, services, helpers, rules, abstracts |
| `quality-runner` | Yes | Yes | Yes | Yes | PHPStan level 8, Duster, Pest |

#### Release

| Agent | Spawned by | Unit |
|-------|-----------|------|
| `workflow-generator` | opscale-release | One per GitHub Actions workflow |
| `release-config-generator` | opscale-release | All configs (.releaserc, commitlint, husky, sonar, etc.) |

#### Installer

| Agent | Spawned by | Purpose |
|-------|-----------|---------|
| `ai-config-generator` | opscale-ai | Reads project surface, generates installer skill that ships with the package |

#### Cross-Cutting

| Agent | app | module | package | library | Purpose |
|-------|:---:|:------:|:-------:|:-------:|---------|
| `constitution-enforcer` | Yes | Yes | Yes | Partial | Code vs constitution rules |
| `support-enforcer` | -- | -- | -- | Yes | strict_types, type safety, structure |
| `traceability-auditor` | Yes | Yes | -- | -- | Verifies spec → DBML → Model → Action chain |
| `gate-checker` | Yes | Yes | Yes | test+release | Completeness checklist per step |

### Examples

#### app/module — `opscale-domain` with 8 entities

```
opscale-domain (skill — orchestrates)
  ├─ Reads DBML, presents inventory, confirms with user
  ├─ Spawns 4x enum-generator              (parallel)
  ├─ Spawns 2x value-object-generator      (parallel)
  ├─ Spawns 8x migration-generator         (dependency order)
  ├─ Spawns 8x model-generator             (parallel)
  ├─ Spawns 8x repository-generator        (parallel)
  ├─ Spawns 1x gate-checker                (sequential)
  └─ Spawns 1x constitution-enforcer       (sequential)
```

#### library — `opscale-test` with 6 classes

```
opscale-test (skill — orchestrates)
  ├─ Spawns 6x support-test-generator  (parallel)
  ├─ Spawns 1x support-enforcer        (sequential)
  ├─ Spawns 1x quality-runner          (sequential)
  └─ Spawns 1x gate-checker            (sequential)
```

## Installation

Symlink all skills into Claude Code's default skills directory:

```bash
mkdir -p ~/.claude/skills
for skill in /path/to/opscale/skills/skills/opscale-*; do
  ln -s "$skill" ~/.claude/skills/$(basename "$skill")
done
```

Skills are discovered automatically — no `settings.json` changes needed. Symlinks keep everything in sync with the repo.

## Usage

Each skill is invoked as a Claude Code slash command inside the target project directory:

```
/opscale-init          # bootstrap a new or existing project
/opscale-process       # generate business spec from informal input
/opscale-domain        # generate domain layer from DBML or direct definitions
/opscale-logic         # generate Opscale Actions
/opscale-test          # generate tests and run quality gates
```

Skills are executed in sequence — each step validates its prerequisites before starting. For package and library projects, skip the spec steps and start directly with the relevant generation skill.

## Testing

``` bash
npm run test
```

## Changelog

Please see [CHANGELOG](CHANGELOG.md) for more information on what has changed recently.

## Contributing

Please see [CONTRIBUTING](https://github.com/opscale-co/.github/blob/main/CONTRIBUTING.md) for details.

## Security

If you discover any security related issues, please email development@opscale.co instead of using the issue tracker.

## Credits

- [Opscale](https://github.com/opscale-co)

## License

The MIT License (MIT). Please see [License File](LICENSE.md) for more information.
