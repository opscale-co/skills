# BPMN projection — shape reference

`bpmn.json` is the source of truth (validated against `schema/bpmn.schema.json`); `bpmn.bpmn` is a **deterministic projection** built by `lib/render/bpmn.mjs` with `bpmn-moddle`. You never hand-write the XML — you author the JSON and render. This file documents the shape the renderer produces so a reader knows what to expect.

## Structure

One `<bpmn:process>` holds the process-level spine plus one **expandable `<bpmn:subProcess isExpanded="true">`** per subprocess:

```
start → subProcess(SP-01) → catch(SP-01) → subProcess(SP-02) → … → [catch] → end
```

Each `catch` is an `<bpmn:intermediateCatchEvent>` — a subprocess-closing wait (the spec's `endsWith`). Inside each subProcess: its own `startEvent`, its operations as flow nodes in `position` order (with any gateway inlined after its step), and its own `endEvent`.

| bpmn.json | BPMN node | id prefix |
|---|---|---|
| first-level `type:"crud"` | `<bpmn:serviceTask>` | `op_` |
| first-level `type:"logic"` | `<bpmn:businessRuleTask>` | `op_` |
| `gateways[]` | `<bpmn:exclusiveGateway>` | `gw_` |
| `events[]` start/end | `<bpmn:startEvent>` / `<bpmn:endEvent>` | `start_` / `end_` |
| `events[]` catch | `<bpmn:intermediateCatchEvent>` | `catch_` |
| subprocess | `<bpmn:subProcess isExpanded="true">` | `sub_` |

A Logic's child operations (crud / logic-ref / output) are **never nodes** — they live only in their Logic's `operations` documentation array.

## Embedded `<bpmn:documentation>` JSON (self-contained XML)

- `<bpmn:process>`: `{"module":"…","standard":"…"}` — **DERIVED at render time** (not stored in `bpmn.json`): the module display name from `process.json` (`module.subdomain`) and the modeling standard from `dbml.json` (`standards.modeling`, or empty).
- `serviceTask` (crud): `{"type":"crud","code","entity","action","step","subprocess"}` — key order fixed.
- `businessRuleTask` (logic): `{"type":"logic","code","id","step","subprocess","rules":[…],"operations":[…]}`.
- `operations` members (lean shape): crud `{"code","entity","action"}`; logic reference `{"code","id"}` (the referenced first-level `logic.id`); output `{"code","content"}`. No channel, no `type` key in the XML.

`step` is the step code (`SP-XX-YY`) — the map key the op is nested under; `subprocess` is the subprocess NAME, looked up in `process.json` (neither is stored on the op in `bpmn.json`). The renderer escapes XML automatically — authors put plain text in `bpmn.json`.

## Layout / DI

The renderer computes the DI itself (one `<bpmndi:BPMNPlane>`): each subProcess shape is `isExpanded="true"` and sized to enclose its children, which are laid out in a horizontal band inside. `bpmn-auto-layout` is **not** used — it collapses subprocesses into drill-down planes. A gateway branch whose target is in another subprocess is routed to that subprocess's end event with the target code kept in the flow label (a sequence flow cannot cross a subProcess boundary in BPMN). See the header comment of `lib/render/bpmn.mjs`.

## Element sizes

| Element | Width | Height |
|---|---|---|
| Start/End/Catch event | 36 | 36 |
| serviceTask / businessRuleTask | 110 | 80 |
| Gateway | 50 | 50 |
| Expandable subProcess | enclosing | 180 |
