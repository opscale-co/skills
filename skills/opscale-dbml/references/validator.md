# DBML validator — Phase 8 + Phase 10 details

## Phase 8 — Run the bundled validator

Assemble the complete raw DBML in memory first, **do not write the final file yet**. Then run the bundled validation script directly from the skill directory. The script is an internal tool — it never gets copied to the project, and the skill bundle already ships `node_modules` with `@dbml/core`, so there is **no install step, ever** (no `npm install`, in the project or in the bundle):

```bash
# Write the assembled DBML to a workspace temp file (inside the repo, not /tmp)
mkdir -p docs/plan
cat > docs/plan/.dbml-validate.tmp.dbml << 'TMPEOF'
[assembled raw DBML content here]
TMPEOF

# Run the validator from the skill bundle directory.
# Pass the module slug as 2nd arg so the subdomain-stem redundancy check runs
# (the temp path carries no spec-folder name to derive it from).
node {SKILL_DIR}/scripts/validate-dbml.mjs docs/plan/.dbml-validate.tmp.dbml {module-slug}

# The temp file is auto-deleted by the script after validation
```

Where `{SKILL_DIR}` is the directory where the `opscale-dbml` skill is installed (wherever this skill's `SKILL.md` lives — e.g. `~/.claude/skills/opscale-dbml`).

Exit codes:

- `1` (syntax error) — fix the reported line/column, re-write the temp file, re-run. Do not proceed until exit code is `0`.
- `2` (quality warnings) — fix all reported warnings, re-write the temp file, re-run until exit code is `0`.
- `0` (pass) — proceed to Phase 9.

The validation script and its dependencies stay in the skill bundle — nothing is installed into or copied to the repo, and the temp file never survives the run. This gate is **mandatory in both modes** (Claude Code and Claude Desktop) — both have console access.

To re-validate an already-written final artifact:

```bash
node {SKILL_DIR}/scripts/validate-dbml.mjs docs/plan/dbml.dbml {module-slug}
```

## Phase 10 — Completeness gate (semantic checks the script can't do)

```
DBML COMPLETENESS GATE
──────────────────────────────────────────────────────
[ ] Modeling standard chosen in Phase 1 (name or "none") recorded in docs/plan/dbml.dbml Project Note and honored across phases 2–6
[ ] External references declared in Phase 3 (or explicit "none") — every cross-subdomain column resolves to a declared slug
[ ] Script exited with code 0 (syntax + quality pass)
[ ] docs/plan/dbml.dbml written (raw DBML, no markdown fence)
[ ] docs/plan/context/external-refs.md written and consistent with DBML notes
[ ] Every table Note opens with its kebab-case entity id (`{kebab} — `, kebab = table name with dashes) — validator-enforced; junction tables get theirs the same way (names.md carries no ids)
[ ] docs/plan/dbml.txt written — one line per Table block in dbml.dbml, same order, nothing else
[ ] The business type IS the column type: every column's type is an Enum of this module or a registry slug written directly (`email`, `money`, …) — no technical types (`varchar`/`text`/`int`/`decimal`/`json`), no legacy `// type:` notes (validator-enforced; only created_at/updated_at/deleted_at are `timestamp`)
[ ] `id`, every FK column, and every external-ref column are typed `identifier` (validator-enforced)
[ ] Every entity name reconciled against the chosen standard (or industry naming if none), or explicitly kept after asking
[ ] Every spec entity outside the standard's scope has an explicit decision (drop / extension / fold)
[ ] Every canonical name in docs/plan/context/names.md has a corresponding DBML table (or an explicit fold/drop decision)
[ ] No technical, UI, or config entities present
[ ] No `tenant_id` columns anywhere (single-tenant deployment model)
[ ] All intra-subdomain relationships have real FK constraints
[ ] All cross-subdomain references are logical only (no FK constraint)
[ ] Every cross-subdomain column has a structured `// external_ref:{slug} | {subdomain}.{table}` note
[ ] Project block Note present
[ ] Every entity traceable to the flow (process.txt) or an explicit user confirmation
──────────────────────────────────────────────────────
STATUS: [ ] PASS — opscale-bpmn may proceed
        [ ] FAIL — list blocking items below
```
