# Flow-test drivability gotchas (confirmed)

Browser flow tests EXECUTE the subprocess through Nova — create via the real form,
run each Action from the detail toolbar, and assert the transition (UI) plus the
persisted DB post-condition. These are the constraints that decide whether a flow
is actually drivable by Dusk. They were confirmed against a real module; honor them
or the test silently fails to touch what it means to.

## 1. Only native `Select` / Text inputs are Dusk-drivable

`$browser->select('@field', $value)` and `->type('@field', $value)` only work on
**native** Nova `Select` and Text components.

- `->searchable()` renders a **custom typeahead** — `select()` cannot set it.
- `BelongsTo` renders a **custom relation component** — not `select()`-able.
- **Two `BelongsTo` to the same resource share a `dusk` id** → the selector is
  ambiguous and Dusk targets the wrong one.

**Rule:** any column a flow test must set **on the create form** must be exposed as
a **native `Select`** (no `->searchable()` on that field). This interacts with
resource Rule 21 (cross-subdomain refs render as searchable Select): for a ref the
flow must set through the form, drop `->searchable()` on that field; otherwise seed
the referenced record via the seeder and select a seeded option. Address modal
fields as `form [dusk="{column}"]`.

## 2. Run Actions from the DETAIL toolbar, never the index toolbar

Standalone actions placed on the **index** toolbar are **not Dusk-drivable**: the
`NovaActionDecorator` does not propagate `$standalone` to the DOM, so the button
never carries a usable selector.

**Rule:** register every Action a flow test must run on the **detail** toolbar and
drive it via `[data-action-id="{identifier}"]` — the full `identifier()`, module prefix
included (`[data-action-id="ventas.approve-quote"]`) — the `openAction()` / `runAction()` helpers
on `DuskTestCase` encapsulate this:

```php
$this->runAction($browser, 'approve-application', [
    ['select', 'committee_id', $committeeUlid],   // native Select in the modal
    ['type', 'decided_on', '01-15-2026'],          // dates in mdY
]);
```

## 3. Fake external-reference ids must be valid ULIDs

Fields typed into a form/modal that carry the `ulid` validation rule (cross-subdomain
reference columns) reject anything that is not a **Crockford base32 ULID** — 26 chars,
no `i`, `l`, `o`, or `u`. A placeholder like `'ref-123'` fails validation and the
submit surfaces a field error, not a successful run.

**Rule:** use a valid ULID for any fake ref id typed into a form, e.g.
`01HZY0ABCDEFGHJKMNPQRSTVWX`.

## 4. DB assertions read the shared workbench SQLite

The Browser suite asserts the persisted post-condition (`->fresh()->status`, counts).
This works because the Dusk server and the test process both open the **file** SQLite
built by the `testbench.yaml` `workbench:` sequence — which is why `phpunit.dusk.xml`
must **not** set `DB_DATABASE` (an `:memory:` override would give the test process a
private, empty DB and every `->fresh()` would return null). See
`opscale-init/references/test-configs.md`.
