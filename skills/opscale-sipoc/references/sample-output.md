# Sample output — opscale-sipoc

One full SIPOC (`docs/plan/sipoc/activate-supplier.md`) and the
`docs/plan/sipoc.json` composition list from the **Proveedores** module
(supplier master lifecycle, `Dominio ERP`, project `compras/proveedores`) —
the same real module used across the Plan skills so the artifacts chain: this
Logic is a `businessRuleTask` in `bpmn.bpmn` (its Process is imported from
that task's `"composed"` array, never re-elaborated), its entities exist in
`dbml.json`, and its BR is part of the module-unique registry the SIPOCs
define. The full set (15 SIPOCs) passes `validate-sipoc.mjs` and the smoke
gate (15 = 15 = 15).

Prose is in **Spanish** (the language of the source flow — the language rule);
section headings, ids (`BR-NN`, kebab `logic.id`) and the `success` key stay
language-neutral because `opscale-logic` parses them literally.

---

```markdown
# SIPOC — Activar proveedor

**Identifier:** `activate-supplier`
**Business Rules:** BR-06
**Composes:** none

Transita el proveedor a estado activo cuando el veredicto de cumplimiento fue aprobado, habilitando compras y pagos, y notifica el alta.

## SIPOC

| Suppliers | Inputs | Process | Outputs | Customers |
|---|---|---|---|---|
| System | proveedor | SP-03-03-L01-C01 | success | All callers |
|  |  | SP-03-03-L01-O01 | estado | System |

## Suppliers
- System — provee el proveedor con veredicto aprobado

## Inputs
| Input | Source | Type | Validation rules | Description |
|-------|--------|------|------------------|-------------|
| proveedor | System | supplier | required | Proveedor con veredicto de cumplimiento aprobado |

## Process
1. `SP-03-03-L01-C01` update supplier.status → active (verifica que el veredicto vino aprobado) (BR-06)
2. `SP-03-03-L01-O01` output aviso de alta al área solicitante y al proveedor (BR-06)
3. return result

## Outputs
| Output | Consumer | Type | Description |
|--------|----------|------|-------------|
| success | All callers | bool | Si la operación tuvo éxito |
| estado | System | supplier_status | Nuevo estado del proveedor (active) |

## Customers
- User — el área solicitante y el proveedor que reciben el aviso de alta
- System — los módulos de compras y pagos que ya pueden operar con el proveedor

## Business Rules
- **BR-06** — El veredicto de cumplimiento debe venir aprobado para activar; la transición pasa el proveedor de en revisión a activo y desde ese momento habilita contratos, facturas y pagos.

## Failure modes
- **Soft failure** (returns `success=false` + `message`): el veredicto no vino aprobado
- **Hard failure** (throws): el proveedor no está en estado en revisión
```

Notes on the SHAPE: the header carries only `Identifier` / `Business Rules` /
`Composes` — operation/subprocess/step are NOT stored (they are derived by
matching the `id` to the BPMN logic op); the one-sentence intro is the SIPOC's
`description`. The `## SIPOC` summary table is filled independently per column
(blank cells when a column has fewer elements); its Process column carries the
composed-op `code`s this Logic orchestrates (each a `read`/`update`/`delete`
CRUD, a composed `L` logic reference, or an `O` output), and the `## Process`
list restates each as its `code` + description + `(BR-NN)`. Types resolve to a
business-type slug (`supplier_status` is a DBML Enum, `supplier` a DBML entity)
— never free scalars; only `success: bool` is exempt. Suppliers/Customers,
input `source`, and output `consumer` carry a plain-text actor label
(`User`/`System`, or `All callers` for `success`), no identity.

## Sample docs/plan/sipoc.json (full)

One block per `businessRuleTask` — `{Name} ({kebab-id})` then the composing
operations — matching each SIPOC's Process section (minus `return result`).
Gates compare it against `bpmn.json`/the XML by unique logic ids and
composed-member counts (15 blocks = 15 unique logic ids = 15 SIPOC files).

```
Preparar expediente requerido (build-required-file)
- create legal_document
- output solicitud de papeleo al proveedor

Verificar fuentes oficiales (verify-official-sources)
- create verification

Devolver expediente para corrección (return-file-for-correction)
- update supplier
- output devolución del expediente para corrección

Enviar a cumplimiento (submit-to-compliance)
- update supplier

Registrar veredicto de cumplimiento (record-compliance-verdict)
- read supplier

Activar proveedor (activate-supplier)
- update supplier
- output aviso de alta al área solicitante y al proveedor

Devolver a subsanación (return-for-remediation)
- update supplier

Verificar vencimiento (check-expiration)
- read legal_document
- output aviso de renovación al proveedor

Verificar cambio de cuenta (verify-account-change)
- create verification
- update financial_account

Escalar a suspensión (escalate-to-suspension)
- update performance_assessment

Suspender proveedor (suspend-supplier)
- update supplier
- output aviso de suspensión al proveedor y a las áreas usuarias

Verificar regularización (verify-remediation)
- create verification

Reactivar proveedor (reactivate-supplier)
- update supplier
- output aviso de reactivación del proveedor

Mantener suspensión (keep-suspended)
- update verification
- output informe de lo que falta para regularizar

Dar de baja proveedor (deactivate-supplier)
- update supplier
```
