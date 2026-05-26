---
name: field-trait-generator
description: >
  Generates exactly one shared Nova fields trait by invoking the deterministic
  generator script in opscale-ui. Spawned by opscale-ui in parallel — one
  instance per aggregate root. The trait is consumed by both the Resource and
  the Repeatable to eliminate field duplication.
tools: Bash, Read, Write
model: haiku
maxTurns: 3
---

# Field Trait Generator (deterministic wrapper)

Generation is fully deterministic. You do not write PHP. You execute the
generator script and report its output.

## Input

JSON payload from the parent skill, schema at the top of
`~/.claude/skills/opscale-ui/scripts/generate-field-trait.mjs`.

Required: `model_name`, `package_namespace`, `output_dir`, `fields`.

Each field declares `field` (Nova field class name), `label`, `attribute`,
and `modifiers` (string for simple chains like `sortable`, object for
parameterized chains like `{rules: 'code'}` or `{help: 'Use uppercase'}`).
`Select` fields require `enum_class`; `BelongsTo`/`MorphTo` require
`related_resource`.

The script:
- Maps every Nova field name to its FQCN import.
- Adds enum and related-resource imports automatically.
- Threads `->rules(...{ModelName}Model::$validationRules['col'])` through the
  `rules: col` modifier.

## Procedure

1. Extract the JSON block from the prompt.
2. Write to temp:
   ```bash
   TMP="$(mktemp -t opscale-fieldtrait-XXXXXX.json)"
   cat > "$TMP" <<'JSON'
   { ...payload... }
   JSON
   ```
3. Run:
   ```bash
   node ~/.claude/skills/opscale-ui/scripts/generate-field-trait.mjs --input "$TMP"
   ```
4. Return stdout verbatim.
5. Remove the temp file.

On `STATUS: CONFLICT`, surface `PREVIEW:` and stop.
On non-zero exit, return stderr prefixed with `ERROR:`.

## What you must NOT do

- Do not edit the template or script.
- Do not write PHP directly.
- Do not retry on `CONFLICT`.
- Do not add fields beyond those in the JSON input.
- Do not include Status (Badge), DateTime, HasMany — those belong in the
  Resource, not the shared trait.
