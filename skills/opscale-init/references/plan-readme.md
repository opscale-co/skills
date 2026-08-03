# Plan intake — `docs/plan/`

This folder holds the Plan-phase artifacts for this module. `opscale-init` creates it empty (plus `context/`); the Plan skills fill it in pipeline order. This manifest documents which skill produces which file, so the folder "expects" these outputs.

| # | Skill | Produces (under `docs/plan/`) |
|---|-------|-------------------------------|
| 1 | `opscale-map` | `context/system.map.md` |
| 2 | `opscale-process` | `context/names.md` + `process.txt` |
| 3 | `opscale-dbml` | `domain.dbml` + `dbml.txt` + `naming.md` + `context/external-refs.md` |
| 4 | `opscale-bpmn` | `logic.bpmn` + `operations.md` + `subprocesses/{kebab-name}.txt` |
| 5 | `opscale-sipoc` | `actions/{kebab-id}.md` (one per Logic) + `sipoc.txt` |
| 6 | `opscale-ontology` | `ontology.html` (Plan closer) |

`context/business-types.md` — canonical, language-agnostic business-type registry, seeded by `opscale-init`; extend it per project.

Files produced in a Claude Desktop planning session are dropped here and the pipeline continues from them.
