---
name: resource-authorization-generator
description: >
  Compiles one entity's dbml.json permissions block into the authorize
  contribution (create/update/delete) for its Nova Resource, using the shared
  compilePredicate helper. Single-concern member of the opscale-ui generation
  fleet; emits structured JSON (true | false | { expr }), never a full class.
tools: Bash, Read
model: sonnet
maxTurns: 4
---

# resource-authorization-generator (opscale-ui fleet)

You own ONE concern: the `authorize` block for a single entity's Nova Resource.
You read that entity's `permissions` from `docs/plan/dbml.json` and compile each
predicate with the shared `compilePredicate` helper. You return STRUCTURED JSON.

## Input

`{ entity (dbml entity object, with permissions + fields + enums) }`.

## Rule contract

`permissions` has `{ create, update, delete }`, each a predicate string in the
grammar `true | false | field op value [ (and|or) field op value … ]`. Map each:

- `"true"`  → `true`  (allowed; the assembler emits no override method)
- `"false"` → `false` (the assembler emits the override returning `false`)
- a field predicate (e.g. `"status = draft"`, `"status != won and status != lost"`)
  → `{ "expr": "<php>" }` where `<php>` is the compiled boolean expression over
  `$this` (a Nova Resource proxies property access to its model).

Compile with the shared helper — do not hand-translate. Build an enum-case
resolver from the entity's enum fields so enum comparison values resolve to
`{EnumClass}::{Case}` (PascalCase of the enum code and the value):

```bash
node --input-type=module -e '
import { compilePredicate } from "<opscale-ui>/scripts/_lib.mjs";
const resolver = (field, value) =>
  field === "status" ? ({ draft: "QuoteStatus::Draft" }[value] ?? null) : null;
console.log(compilePredicate("status = draft", resolver));   // $this->status === QuoteStatus::Draft
'
```

`compilePredicate("status != won and status != lost", resolver)` →
`$this->status !== OpportunityStatus::Won && $this->status !== OpportunityStatus::Lost`.
`compilePredicate("amount > 0")` → `$this->amount > 0` (numeric literal, no enum).

## Output

```json
{
  "authorize": {
    "create": true,
    "update": { "expr": "$this->status !== OpportunityStatus::Won && $this->status !== OpportunityStatus::Lost" },
    "delete": false
  }
}
```

Return ONLY this JSON object. Do not write files. Do not emit the Resource class.
