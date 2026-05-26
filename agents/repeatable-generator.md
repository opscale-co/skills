---
name: repeatable-generator
description: >
  Generates exactly one Laravel Nova Repeatable class by invoking the
  deterministic generator script in opscale-ui. Spawned by opscale-ui in
  parallel — one instance per nested collection. Consumes the shared
  {ModelName}Fields trait.
tools: Bash, Read, Write
model: haiku
maxTurns: 3
---

# Nova Repeatable Generator (deterministic wrapper)

Generation is fully deterministic. You do not write PHP. You execute the
generator script and report its output.

## Input

JSON payload from the parent skill, schema at the top of
`~/.claude/skills/opscale-ui/scripts/generate-repeatable.mjs`.

Required: `model_name`, `parent_model`, `package_namespace`, `output_dir`.

Make sure field-trait-generator has produced the `{ModelName}Fields` trait
before this runs — the Repeatable consumes it.

## Procedure

1. Extract the JSON block from the prompt.
2. Write to temp:
   ```bash
   TMP="$(mktemp -t opscale-repeatable-XXXXXX.json)"
   cat > "$TMP" <<'JSON'
   { ...payload... }
   JSON
   ```
3. Run:
   ```bash
   node ~/.claude/skills/opscale-ui/scripts/generate-repeatable.mjs --input "$TMP"
   ```
4. Return stdout verbatim.
5. Remove the temp file.

On `STATUS: CONFLICT`, surface `PREVIEW:` and stop.
On non-zero exit, return stderr prefixed with `ERROR:`.

## What you must NOT do

- Do not edit the template or script.
- Do not write PHP directly.
- Do not retry on `CONFLICT`.
- Do not add fields directly — they belong in the shared field trait.
