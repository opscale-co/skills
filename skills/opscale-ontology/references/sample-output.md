# Sample output — opscale-ontology

Excerpt of a filled `docs/plan/ontology.html` tree region for the same
**recruitment** module used by the `.txt` samples of the other Plan skills
(see `opscale-sipoc/references/sample-output.md`): every Logic shown here has
a block in `sipoc.txt`, every entity badge exists in `dbml.txt`, every step
appears in `process.txt` and `subprocesses/`.

Shows the SHAPE of the model-authored region between `<!-- ONTOLOGY:BEGIN -->`
and `<!-- ONTOLOGY:END -->`. Everything outside that region (styles, header,
buttons, script) comes verbatim from `assets/ontology-template.html` and is
never edited.

---

Markup rules the excerpt demonstrates:

- One `<details data-level>` per hierarchy node: `software` → `domain` →
  `module` → `subprocess` → `step`. High levels carry `open`; steps and
  Logics start closed.
- Top-level operations carry `data-level="operation"` + `data-cat`
  (`crud` | `logic` | `output`). Their total equals the `- ` lines in
  the `subprocesses/` outlines.
- CRUDs composed inside a Logic carry `data-inner="crud"` (no `data-level` —
  they are not counted as operations; they mirror the Composition block of
  `operations.md` line for line).
- Plain CRUDs, Outputs and inner CRUDs are `<div>` (nothing collapsible
  without children). Logics are `<details>` with the id badge
  (`= actions/{id}.md` filename = future Action identifier), BR badges, the
  one-line SIPOC description, and the `returns:` output keys.
- ⏳ waits and 🔀 gateways render as `<div class="flow">` markers — flow
  elements, never operations.

```html
<details data-level="software" open><summary>🏢 Acme HR Suite <span class="count">1 domain</span></summary>
<details data-level="domain" open><summary>👥 Human Resources <span class="count">1 module</span></summary>
<details data-level="module" open><summary>🧩 Recruitment <span class="count">5 subprocesses</span></summary>

<details data-level="subprocess" open>
<summary>⏳ Offer <span class="count">3 steps · 4 operations</span></summary>

  <details data-level="step">
  <summary>Extend the offer <span class="count">1 operation</span></summary>
    <details data-level="operation" data-cat="logic" data-id="extend-offer">
    <summary>⚙️ Extend offer <span class="badge id">extend-offer</span>
      <span class="badge br">BR-07</span> <span class="note">future Action</span></summary>
      <p class="desc">Issues a formal offer to the selected candidate.</p>
      <div data-inner="crud">📝 read <span class="badge entity">candidate</span> (verify status = selected)</div>
      <div data-inner="crud">📝 create <span class="badge entity">offer</span></div>
      <div data-inner="crud">📝 update <span class="badge entity">candidate</span>.status → offered</div>
      <p class="outs">returns: success, offer_id, new_status</p>
    </details>
  </details>

  <div class="flow">⏳ wait: candidate responds to the offer</div>

  <details data-level="step">
  <summary>Resolve the response <span class="count">2 operations</span></summary>
    <div class="flow">🔀 gateway: accepted?</div>
    <details data-level="operation" data-cat="logic" data-id="accept-offer">
    <summary>⚙️ Accept offer <span class="badge id">accept-offer</span>
      <span class="badge br">BR-08</span> <span class="note">future Action</span></summary>
      <p class="desc">Locks the accepted offer within its response term.</p>
      <div data-inner="crud">📝 read <span class="badge entity">offer</span> (verify sent and within term)</div>
      <div data-inner="crud">📝 update <span class="badge entity">offer</span>.status → accepted</div>
      <p class="outs">returns: success, new_status</p>
    </details>
    <details data-level="operation" data-cat="logic" data-id="reject-offer">
    <summary>⚙️ Reject offer <span class="badge id">reject-offer</span>
      <span class="badge br">BR-08</span> <span class="note">future Action</span></summary>
      <p class="desc">Declines the offer and discards the candidate.</p>
      <div data-inner="crud">📝 read <span class="badge entity">offer</span> (verify sent and within term)</div>
      <div data-inner="crud">📝 update <span class="badge entity">offer</span>.status → rejected</div>
      <div data-inner="crud">📝 update <span class="badge entity">candidate</span>.status → discarded</div>
      <p class="outs">returns: success, new_status</p>
    </details>
  </details>

  <details data-level="step">
  <summary>Notify the outcome <span class="count">1 operation</span></summary>
    <div class="op" data-level="operation" data-cat="output">📩 email the candidate the outcome</div>
  </details>

</details>

</details>
</details>
</details>
```
