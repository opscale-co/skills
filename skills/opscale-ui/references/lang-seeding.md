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

The four strings map directly to the JSON contract of
`generate-resource.mjs`: `label`, `singular_label`, `label_es`,
`singular_label_es`. They flow into `__()` and get seeded into BOTH
`lang/en.json` and `lang/es.json`. Reject empty answers, reject
literal `subdomain · entity` concatenations, reject the bare entity
name when more than one subdomain is in play.

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
