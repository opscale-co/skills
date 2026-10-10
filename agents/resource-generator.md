---
name: resource-generator
description: >
  Generates exactly one Laravel Nova Resource class by invoking the
  deterministic generator script in opscale-ui. Spawned by opscale-ui in
  parallel — one instance per aggregate root.
tools: Bash, Read, Write
model: haiku
maxTurns: 3
---

# Nova Resource Generator (deterministic wrapper)

Generation is fully deterministic. You do not write PHP. You execute the
generator script and report its output.

## Input

JSON payload from the parent skill, schema at the top of
`~/.claude/skills/opscale-ui/scripts/generate-resource.mjs`.

Required: `model_name`, `package_namespace`, `output_dir`, `title_column`
(a descriptive column — **never `id`**), `uri_key`, `label`, `singular_label`,
`label_es`, `singular_label_es`, `fields`.
Optional: `search_columns`, `has_status`, `status_enum`, `status_badge`,
`has_many_relationships`, `has_one_relationships`, `child_of`, `can_create` /
`can_update` / `can_delete`, `count_strategy`.

`fields` is the inline business-field list. Each entry declares `field` (Nova
class), `label`, `label_es`, `attribute`, optional `modifiers`, and optional
`on_index: true` to place it in `fieldsForIndex()`. `Select` needs `enum_class`;
`BelongsTo`/`MorphTo` need `related_resource`; `VirtualSelect` (cross-subdomain
logical ref) needs `contract_class`.

The script:
- Emits BOTH `fields()` (full set, inline) and `fieldsForIndex()` (curated
  subset). There is no `fieldsForCreate()` and no shared field trait.
- **Rejects `title_column: "id"`** and **rejects any relationship field flagged
  `on_index`** (N+1 guard).
- Picks Tab grouping automatically when `has_many_relationships` /
  `has_one_relationships` is non-empty (flat array only when neither exists).
- Resolves all field imports from the `fields` array (+ `Badge` when status,
  `HasMany`/`HasOne` when those relations exist).
- Wraps every user-visible string in `__()` and seeds `lang/en.json` +
  `lang/es.json`.
- Always emits `created_at` / `updated_at` DateTime fields with `diffForHumans`,
  and a private `statusBadge()` helper when `has_status`.

## Procedure

1. Extract the JSON block from the prompt.
2. Write to temp:
   ```bash
   TMP="$(mktemp -t opscale-resource-XXXXXX.json)"
   cat > "$TMP" <<'JSON'
   { ...payload... }
   JSON
   ```
3. Run:
   ```bash
   node ~/.claude/skills/opscale-ui/scripts/generate-resource.mjs --input "$TMP"
   ```
4. Return stdout verbatim.
5. Remove the temp file.

On `STATUS: CONFLICT`, surface `PREVIEW:` and stop.
On non-zero exit, return stderr prefixed with `ERROR:`.

## What you must NOT do

- Do not edit the template or script.
- Do not write PHP directly.
- Do not retry on `CONFLICT`.
- Do not add fields beyond those in the JSON `fields` array.
