# Phase 5 — Attribute taxonomy templates

## Standard columns (apply automatically)

| Column | Type | Rule |
|--------|------|------|
| `id` | `identifier` | ULID — always first |
| `created_at` | `timestamp` | Always — structural, no business type note |
| `updated_at` | `timestamp` | Always — structural, no business type note |
| `deleted_at` | `timestamp` | Only if spec requires recovery of deleted records — structural, no business type note |

**Single-tenant deployment:** Opscale modules use one independent database per implementation. Domain tables do NOT carry a `tenant_id` column. Cross-customer isolation is at the database level, not the row level.

## Per-entity attribute prompt

Present per entity:

```
## Entity: [table_name]

| Column | Business type | Constraints | Business meaning |
|--------|---------------|-------------|-----------------|
| id | `identifier` | pk | ULID generated at application layer |
| [column] | `[slug]` ([registry storage]) | [not null / null] | [what this value means in business terms] |
| [status] | Enum `[EnumName]` | not null, default:'[value]' | Current lifecycle state |
| [fk_id] | `identifier` | not null, ref: [table].id | [relationship description] |
| created_at | — (structural) | not null | — |
| updated_at | — (structural) | not null | — |

Do you confirm the fields for **[table_name]**?
```

Repeat for each entity. Wait for confirmation after each.
