# i18n / Lang seeding — seed BOTH `lang/en.json` AND `lang/es.json`

## Per-resource contextual labels (Phase 3b)

For each aggregate, ask the user for the **contextual** plural and
singular label in both English and Spanish. Do NOT auto-derive from
the entity name — the only person who knows whether `application` in
`credits` should read "Credit application" vs "Loan application" is
the operator/owner.

```
For each aggregate, confirm contextual labels:

  [ModelA]  (entity '{snake_name}' in subdomain '{subdomain}')
    plural EN   :
    singular EN :
    plural ES   :
    singular ES :
```

Every translatable carries a namespaced KEY plus its EN and ES values.
The assembler emits `__(key)` and seeds `key → en` into `lang/en.json`
and `key → es` into `lang/es.json`. Domain keys are
`{prefix}.{resource}.{slug}` (`ventas.opportunity.label`,
`ventas.opportunity.singular`, `ventas.opportunity.title`,
`ventas.opportunity.tab.quotes`, `ventas.opportunity.status.won`);
generic fixed UI keys are global `opscale.*` (`opscale.details`,
`opscale.status`, `opscale.created_at`, `opscale.updated_at`) and are
supplied by the assembler. So the JSON contract carries `label` = the
KEY, plus `label_en`/`label_es` (same for `singular_label`, tab labels,
status-badge labels, field labels). `uri_key` stays a raw kebab slug —
never translated. Reject empty answers, reject literal `subdomain ·
entity` concatenations, reject the bare entity name when more than one
subdomain is in play.

Enum option labels and any custom Tab labels get the same EN/ES
treatment when their resources are generated.

## Why both locales, always

Every label, enum option, status badge label, tab name, and help text
wrapped in `__()` MUST have keys in both `lang/en.json` and
`lang/es.json` immediately after generation. EN-only seeding shifts
dozens of translation tasks to the user post-generation and they get
silently dropped.

## Sources of translation values

- **Resource / aggregate / tab labels** — user-supplied contextual
  phrases prompted per locale. Never invented; never auto-translated.
- **Enum options** — both EN and ES values prompted from the user per
  case (they encode business meaning).
- **Fixed UI strings** (`Details`, `Status`, `Created At`, `Updated
  At`, etc.) — auto-filled from the built-in EN/ES dictionary baked
  into the generator scripts.

Existing keys are never overwritten — re-running the generator only
fills gaps.

## URI + Label methods on every Resource

`uriKey()`, `label()`, `singularLabel()` are non-optional. Nova's
defaults pluralize the model class name in English; that breaks any
non-English deployment, leaves the resource invisible in localized menus,
and produces ambiguous labels when several subdomains share generic
entity names (`application`, `request`, `note`, `task`). The generator
emits these three methods unconditionally — `uri_key`, `label`, and
`singular_label` are required JSON inputs.

Example: entity `application` in subdomain `credits` →

- label: `"Credit applications"` / `"Aplicaciones de crédito"`
- singularLabel: `"Credit application"` / `"Aplicación de crédito"`

NOT `"credits · application"` (technical, ugly), NOT `"Application"`
alone (collides with every other subdomain).

```php
public static function uriKey(): string         { return '[plural-kebab-case]'; }
public static function label(): string          { return __('[Plural Label]'); }
public static function singularLabel(): string  { return __('[Singular Label]'); }
```
