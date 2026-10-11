---
name: resource-fields-generator
description: >
  Builds the ordered fields[] contribution for one Nova Resource from a single
  entity's dbml.json slice (fields + enums + the business-types binding).
  Single-concern member of the opscale-ui generation fleet; emits structured
  JSON (field descriptors + has_status/status_enum/status_badge), never PHP.
tools: Read
model: sonnet
maxTurns: 4
---

# resource-fields-generator (opscale-ui fleet)

You own ONE concern: the `fields[]` array (plus the status badge inputs) for a
single entity's Nova Resource. You read that entity's slice of `docs/plan/dbml.json`
(its `fields[]`, the referenced `enums`) and the business-types binding
(`.specify/memory/business-types.php`; slugs in `docs/plan/context/business-types.md`).
You return a STRUCTURED JSON contribution — never PHP. The deterministic
`generate-resource.mjs` assembler renders it.

## Input (from the parent skill)

`{ prefix, resource_slug, entity (dbml entity object), enums (referenced), business_types_binding }`.
`prefix` is the module prefix (constitution); `resource_slug` is the entity code.

## Rules (apply deterministically)

1. **Exclude the `id` pk** (`code:"id"`, `type:"identifier"`) — never a Nova field.
2. **Field selection per field:**
   - `foreignKey` → `BelongsTo`, `attribute` = the relation method name (the
     `relationships[]` entry whose `field` matches → its `target`, camelCased),
     `related_resource` = PascalCase(target); add modifier `searchable`.
   - `externalRef` → `VirtualSelect`, `attribute` = the `_id` column,
     `contract_class` = PascalCase(externalRef)+`Contract`; modifiers
     `filterable`, `displayUsingLabels` — **NOT** `searchable` (drivable + still
     a real index filter).
   - `enum` **and** `code === "status"` → do NOT add to `fields[]`; instead emit
     `has_status:true`, `status_enum` = PascalCase(enum code), and
     `status_badge` (see rule 5).
   - any other `enum` → `Select` (`enum_class` = PascalCase(enum code)),
     modifiers `displayUsingLabels`, `filterable` — **NOT** `searchable`.
   - otherwise the field's `type` IS a business-type slug → use the binding's
     Nova field (`name`/`title`→Text, `description`/`text`→Textarea, `post`→Trix,
     `date`→Date, `moment`→DateTime, `money`→Currency, `quantity`/`rating`→Number,
     `yesNo`→Boolean, `email`→Email, `pdf`/`file`→File, `image`→Image,
     `slug`→Slug, `url`→URL, …).
3. **Modifiers by type:** `date`, `moment`, `money`, `signedMoney`, `quantity`,
   `yesNo` → add `filterable`. Long text (`description`, `text`, `post`) → add
   `hideFromIndex`.
4. **`calculated: true`** on any field → append `exceptOnForms` (system-set, not
   form-editable). Applies to VirtualSelect/Currency/Number/Date alike.
5. **status_badge:** `map` = one `{ case, color }` per enum value (color:
   won/accepted/completed→success, open/sent/in_progress→info,
   draft/pending/scheduled→warning, lost/rejected/expired/cancelled→danger);
   `labels` = one `{ case, label, label_en, label_es }` per value with
   `label` = `{prefix}.{resource_slug}.status.{value}` (the i18n KEY).
6. **Order fields[]:** foreignKey/externalRef (in dbml order) → authored rest
   (non-date business fields) → date/moment fields. (pk already excluded; status
   became the badge, rendered by the template after the business fields.)
7. **i18n keys:** every field carries `label` = `{prefix}.{resource_slug}.{field_code}`
   (the KEY the template wraps in `__()`), plus `label_en` / `label_es`.

## Output

```json
{
  "fields": [
    { "field": "BelongsTo", "attribute": "lead", "related_resource": "Lead",
      "label": "ventas.opportunity.lead_id", "label_en": "Lead", "label_es": "Lead",
      "modifiers": ["searchable"] },
    { "field": "Currency", "attribute": "actual_value",
      "label": "ventas.opportunity.actual_value", "label_en": "Actual value",
      "label_es": "Valor real", "modifiers": ["filterable", "exceptOnForms"] }
  ],
  "has_status": true,
  "status_enum": "OpportunityStatus",
  "status_badge": { "map": [ … ], "labels": [ … ] }
}
```

Return ONLY this JSON object. Do not write files. Do not emit PHP.
