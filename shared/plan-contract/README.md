# Plan contract (`shared/plan-contract/`)

The single source of the Plan phase's data contract, shared by the 5 Plan
skills (`opscale-process`, `opscale-dbml`, `opscale-bpmn`, `opscale-sipoc`,
`opscale-graph`). It holds:

- `schema/` — the JSON Schemas each `<skill>.json` source of truth validates against.
- `lib/skills/<skill>.mjs` — the per-skill entry points (`validate`, `generate`).
- `lib/validate.mjs`, `lib/build-common-schema.mjs` — shared validation plumbing.
- `lib/render/<skill>.mjs` — the deterministic renderers that project each JSON SoT
  to its diagram (`process.mmd`, `dbml.dbml`, `bpmn.bpmn`, `sipoc/<id>.md`, `graph.html`).
- `business-types.md` — the canonical, language-agnostic business-type registry
  (copied into a project's `docs/plan/context/` on first use).
- `artifact-paths.md` — the canonical `docs/plan/` path registry and per-file formats.
- `node_modules/` — the bundled runtime deps (`ajv`, `ajv-formats`, `@dbml/core`,
  `bpmn-moddle`, `bpmn-auto-layout`, …). Committed so the validators/renderers run
  with zero install, in Claude Code or Claude Desktop.

## How each skill finds the contract

Each Plan skill's `scripts/validate-*.mjs` and `scripts/render-*.mjs` are thin
wrappers that resolve the contract through a small fallback list (see e.g.
`skills/opscale-process/scripts/validate-process.mjs`):

```
../../../shared/plan-contract   # in this monorepo (scripts/ → repo root → shared)
../shared/plan-contract         # alternate layout
../plan-contract                # VENDORED into a packaged bundle (bundle-root/plan-contract)
```

The first path that exists wins.

## Packaging requirement (vendoring)

When a Plan skill is packaged as a standalone `.skill`/`.zip` there is no
monorepo, so the first two fallbacks do not resolve. The contract therefore
**MUST be vendored into the bundle** at:

```
<bundle-root>/plan-contract/        # i.e. alongside the skill's SKILL.md, scripts/, …
```

so the resolver's `../plan-contract` fallback (relative to the skill's
`scripts/`) finds it. The vendored copy must include `node_modules/` — the
validators/renderers import `ajv`, `@dbml/core`, `bpmn-moddle` and
`bpmn-auto-layout` at runtime.

This project's packager, `scripts/package_skill.py`, does this automatically
for the 5 Plan skills (`PLAN_SKILLS`): after zipping the skill folder it walks
`shared/plan-contract/` and adds every file (node_modules included, build junk
excluded) under `<name>/plan-contract/`.

> Note: the vendored upstream packager
> `tools/vendor/skill-creator/scripts/package_skill.py` is **not** used for Plan
> skills — it packages a single folder and strips `node_modules`, so it cannot
> vendor the contract. Use `scripts/package_skill.py`. If you adopt a different
> packaging pipeline, it must reproduce the vendoring step described above.
