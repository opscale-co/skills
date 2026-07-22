# Vendored: skill-creator scripts

Verbatim copy of the eval/packaging scripts from Anthropic's official
`skill-creator` plugin (claude-plugins-official marketplace). Do not edit in
place — reuse as-is, wrap from tools/ when behavior must differ.

Vendored because CI and other machines can't rely on a locally installed
plugin path. Layout preserved (`scripts/` package) so the internal
`from scripts.utils import ...` imports keep working; run them with this
directory as cwd or on PYTHONPATH:

    cd tools/vendor/skill-creator && python3 -m scripts.run_eval --help

Contents:
- scripts/run_eval.py            trigger evals (layer 2) via `claude -p`
- scripts/run_loop.py            trigger eval + description-improve loop
- scripts/improve_description.py revision step used by run_loop
- scripts/generate_report.py     HTML report for run_loop
- scripts/aggregate_benchmark.py benchmark.json/md aggregation (layers 3-4)
- scripts/package_skill.py       .skill packaging (excludes evals/ at root)
- scripts/quick_validate.py      frontmatter validation (requires PyYAML)
- agents/ + references/          grader/analyzer prompts and JSON schemas

Note: quick_validate.py (and package_skill.py, which imports it) require
PyYAML. The layer-1 linter (tools/lint_skills.py) is stdlib-only on purpose.
