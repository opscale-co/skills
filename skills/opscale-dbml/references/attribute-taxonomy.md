# Phase 5 — Attribute taxonomy templates

## Standard columns (apply automatically)

| Column | Type | Rule |
|--------|------|------|
| `id` | `varchar(26)` | ULID — always first |
| `created_at` | `timestamp` | Always |
| `updated_at` | `timestamp` | Always |
| `deleted_at` | `timestamp` | Only if spec requires recovery of deleted records |

**Single-tenant deployment:** Opscale modules use one independent database per implementation. Domain tables do NOT carry a `tenant_id` column. Cross-customer isolation is at the database level, not the row level.

## Per-entity attribute prompt

Present per entity:

```
## Entity: [table_name]

| Column | Type | Constraints | Business meaning |
|--------|------|-------------|-----------------|
| id | varchar(26) | pk | ULID generated at application layer |
| [column] | [type] | [not null / null] | [what this value means in business terms] |
| [status] | [EnumName] | not null, default:'[value]' | Current lifecycle state |
| [fk_id] | varchar(26) | not null, ref: [table].id | [relationship description] |
| created_at | timestamp | not null | — |
| updated_at | timestamp | not null | — |

Do you confirm the fields for **[table_name]**?
```

Repeat for each entity. Wait for confirmation after each.
