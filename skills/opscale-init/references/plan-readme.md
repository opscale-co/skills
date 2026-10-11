# Plan intake — `docs/plan/`

This folder holds the Plan-phase artifacts for this module. `opscale-init` creates it empty (plus `context/`); the Plan skills fill it in pipeline order. This manifest documents which skill produces which file, so the folder "expects" these outputs.

| # | Skill | Produces (under `docs/plan/`) |
|---|-------|-------------------------------|
| 1 | `opscale-map` | `context/system.map.md` |
| 2 | `opscale-process` | `process.mmd` + `process.json` (+ `context/names.md`) |
| 3 | `opscale-dbml` | `dbml.dbml` + `dbml.json` + `context/external-refs.md` |
| 4 | `opscale-bpmn` | `bpmn.bpmn` + `bpmn.json` |
| 5 | `opscale-sipoc` | `sipoc/{kebab-id}.md` (one per Logic) + `sipoc.json` |
| 6 | `opscale-graph` | `graph.json` + `graph.html` (Plan closer) |

`context/business-types.md` — canonical, language-agnostic business-type registry, seeded by `opscale-init`; extend it per project.

Files produced in a Claude Desktop planning session are dropped here and the pipeline continues from them.
