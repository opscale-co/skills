# Sample output — opscale-sipoc

One full SIPOC (`docs/plan/sipoc/activate-supplier.md`) and the
`docs/plan/sipoc.txt` composition list from the **Proveedores** module
(supplier master lifecycle, `Dominio ERP`, project `compras/proveedores`) —
the same real module used across the Plan skills so the artifacts chain: this
Logic is a `businessRuleTask` in `bpmn.bpmn` (its Process is imported from
that task's `"composed"` array, never re-elaborated), its entities exist in
`dbml.txt`, and its BR is part of the module-unique registry the SIPOCs
define. The full set (15 SIPOCs) passes `validate-sipoc.mjs` and the smoke
gate (15 = 15 = 15).

Prose is in **Spanish** (the language of the source flow — the language rule);
section headings, ids (`BR-NN`, kebab `logic.id`) and the `success` key stay
language-neutral because `opscale-logic` parses them literally.

---

```markdown
# SIPOC — Activar proveedor

**Identifier:** `activate-supplier`
**Operation:** `SP-03-03-L01`
**BPMN task:** Activar proveedor
**Subprocess:** SP-03 Activación de proveedor
**Step:** Activar al proveedor habilitando compras y pagos
**Business Rules:** BR-06
**Composes:** none

Transita el proveedor a estado activo cuando el veredicto de cumplimiento fue aprobado, habilitando compras y pagos, y notifica el alta.

## SIPOC

| Suppliers | Inputs | Process | Outputs | Customers |
|---|---|---|---|---|
| 💻 | proveedor | crud: update supplier | success | All callers |
|  |  | output: aviso de alta al área solicitante y al proveedor | estado | 👤 |
|  |  |  |  | 💻 |

## Suppliers
- 💻 System — provee el proveedor con veredicto aprobado

## Inputs
| Input | Source | Cómo se obtiene | Type | Validation rules | Description |
|-------|--------|-----------------|------|------------------|-------------|
| proveedor | 💻 | registro pasado desde el flujo | supplier | required | Proveedor con veredicto de cumplimiento aprobado |

## Process
1. update supplier.status → active (verifica que el veredicto vino aprobado) (BR-06)
2. output aviso de alta al área solicitante y al proveedor (BR-06)
3. return result

## Outputs
| Output key | Type | Description | Consumers |
|------------|------|-------------|-----------|
| success | bool | Si la operación tuvo éxito | Todos los llamadores |
| estado | supplier_status | Nuevo estado del proveedor (active) | 💻 |

## Customers
- 👤 User — el área solicitante y el proveedor que reciben el aviso de alta
- 💻 System — los módulos de compras y pagos que ya pueden operar con el proveedor

## Business Rules enforced
- **BR-06** — El veredicto de cumplimiento debe venir aprobado para activar; la transición pasa el proveedor de en revisión a activo y desde ese momento habilita contratos, facturas y pagos.

## Failure modes
- **Soft failure** (returns `success=false` + `message`): el veredicto no vino aprobado
- **Hard failure** (throws): el proveedor no está en estado en revisión
```

Notes on the SHAPE: the `## SIPOC` summary table is filled independently per
column (blank cells when a column has fewer elements); its Process column
carries this Logic's composed members prefixed `crud:` / `logic:` / `output:`.
Types resolve to a business-type slug (`supplier_status` is a DBML Enum,
`supplier` a DBML entity) — never free scalars; only `success: bool` is
exempt. Suppliers/Customers carry the actor tag only (👤/💻), no identity.

## Sample docs/plan/sipoc.txt (full)

One block per `businessRuleTask` — `{Name} ({kebab-id})` then the composing
operations — matching each SIPOC's Process section (minus `return result`).
Gates compare it against `bpmn.txt`/the XML by unique logic ids and
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
