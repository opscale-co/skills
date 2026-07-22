# DBML validator — Phase 7 + Phase 9 details

## Phase 7 — Run the bundled validator

Assemble the complete raw DBML in memory first, **do not write the file yet**. Then run the bundled validation script directly from the skill directory. The script is an internal tool — it never gets copied to the project:

```bash
# Install @dbml/core into the skill's own directory (one-time)
cd {SKILL_DIR}/opscale-dbml && npm install @dbml/core --no-save 2>/dev/null

# Write assembled DBML to a temp file
cat > /tmp/.dbml-validate.tmp.dbml << 'TMPEOF'
[assembled raw DBML content here]
TMPEOF

# Run the validator from the skill directory
node {SKILL_DIR}/opscale-dbml/scripts/validate-dbml.mjs /tmp/.dbml-validate.tmp.dbml

# Temp file is auto-deleted by the script after validation
```

Where `{SKILL_DIR}` is the directory where the skills are installed (e.g. `/home/user/.claude/skills` or wherever `opscale-dbml.skill` was unpacked).

Exit codes:

- `1` (syntax error) — fix the reported line/column, re-write the temp file, re-run. Do not proceed until exit code is `0`.
- `2` (quality warnings) — fix all reported warnings, re-write the temp file, re-run until exit code is `0`.
- `0` (pass) — proceed to Phase 8.

The temp file and the validation script stay outside the project — nothing is added to the repo.

## Phase 9 — Completeness gate (semantic checks the script can't do)

```
DBML COMPLETENESS GATE
──────────────────────────────────────────────────────
[ ] Modeling standard chosen in Phase 0 (name or "none") recorded in final/domain.dbml Project Note and honored across phases 1–5
[ ] External references declared in Phase 2 (or explicit "none") — every cross-subdomain column resolves to a declared slug
[ ] Script exited with code 0 (syntax + quality pass)
[ ] final/domain.dbml written (raw DBML, no markdown fence)
[ ] final/external-refs.md written and consistent with DBML notes
[ ] final/naming.md written — one row per entity + per external ref, canonical name matches process.md Name normalization
[ ] Every column checked against the business-types registry — matching columns carry `// type:{slug}` and use the registry's storage mapping; no bare varchar where a business type exists
[ ] logs/dbml.md written
[ ] Every entity name reconciled against the chosen standard (or industry naming if none), or explicitly kept after asking
[ ] Every spec entity outside the standard's scope has an explicit decision (drop / extension / fold)
[ ] Every Entity artifact from final/process.md has a corresponding DBML table
[ ] No technical, UI, or config entities present
[ ] No `tenant_id` columns anywhere (single-tenant deployment model)
[ ] All intra-subdomain relationships have real FK constraints
[ ] All cross-subdomain references are logical only (no FK constraint)
[ ] Every cross-subdomain column has a structured `// external_ref:{slug} | {subdomain}.{table}` note
[ ] Project block Note present
[ ] Every entity traceable to a spec section
──────────────────────────────────────────────────────
STATUS: [ ] PASS — opscale-bpmn may proceed
        [ ] FAIL — list blocking items below
```

## Script installation (alternative invocation)

The validation script lives at `.specify/scripts/validate-dbml.mjs` in the skill bundle. When `opscale-init` sets up the project, copy it to the project:

```bash
cp .specify/scripts/validate-dbml.mjs .specify/scripts/validate-dbml.mjs
```

Or run it directly from the skill path:

```bash
node /path/to/opscale-dbml/scripts/validate-dbml.mjs .specify/specs/{NNN}-{slug}/final/domain.dbml
```
