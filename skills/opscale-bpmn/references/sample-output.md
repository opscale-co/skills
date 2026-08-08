# Sample output — opscale-bpmn

Excerpt of `docs/plan/bpmn.bpmn` and the full `docs/plan/bpmn.txt` from the
**Proveedores** module (supplier master lifecycle, `Dominio ERP`, project
`compras/proveedores`) — the same real module used across the Plan skills so
the artifacts chain: every business step below appears in `process.txt`, every
logic id has a file in `sipoc/` and a block in `sipoc.txt`, every entity
exists in `dbml.txt`. The full set passes every Plan validator.

---

The XML is **self-contained**: the `<bpmn:process>` documentation carries the
module + modeling standard, and every task's documentation JSON carries its
`oid`, business step, and subprocess — Logics also carry their governing rules
(prose; BR-NN numbering is assigned later by `opscale-sipoc`) and composed
members (CRUDs and Outputs; a composed Logic reference `{"oid","id"}` is also
possible when an Action reuses another). There are no sendTask nodes: Outputs
live inside their Logic. No companion file is needed to interpret the diagram.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_proveedores"
  targetNamespace="http://opscale.co/bpmn">

  <bpmn:process id="proc_proveedores" name="Proveedores" isExecutable="false">
    <bpmn:documentation>{"module":"Proveedores","standard":"UBL / Peppol"}</bpmn:documentation>

    <!-- Standalone CRUD step — the central entity's birth with its initial status -->
    <bpmn:serviceTask id="t_create_supplier" name="create supplier">
      <bpmn:documentation>{"type":"crud","oid":"SP-01-01-C01","entity":"supplier","action":"create","step":"Registrar al proveedor como pendiente, sin habilitar compras ni pagos","subprocess":"SP-01 Registro de proveedor"}</bpmn:documentation>
      <bpmn:incoming>flow_001</bpmn:incoming>
      <bpmn:outgoing>flow_002</bpmn:outgoing>
    </bpmn:serviceTask>

    <!-- Logic — backed 1:1 by an Action with the same kebab id. Its composed
         array mixes a CRUD and an Output (the request sent to the supplier). -->
    <bpmn:businessRuleTask id="t_build_file" name="Preparar expediente requerido">
      <bpmn:documentation>{"type":"logic","oid":"SP-01-02-L01","id":"build-required-file","step":"Determinar el papeleo requerido según su tipo (empresa o persona natural)","subprocess":"SP-01 Registro de proveedor","rules":["El papeleo requerido depende del tipo de proveedor (empresa o persona natural); el conjunto de documentos exigidos se crea en estado pendiente."],"composed":[{"oid":"SP-01-02-L01-C01","entity":"legal_document","action":"create"},{"oid":"SP-01-02-L01-O01","content":"solicitud de papeleo al proveedor"}]}</bpmn:documentation>
      <bpmn:incoming>flow_002</bpmn:incoming>
      <bpmn:outgoing>flow_003</bpmn:outgoing>
    </bpmn:businessRuleTask>

    <!-- Gateway — the approval decision; both resolutions are modeled
         (activate-supplier / return-for-remediation), each its own Logic. -->
    <bpmn:exclusiveGateway id="gw_verdict" name="¿El veredicto viene aprobado?">
      <bpmn:incoming>flow_010</bpmn:incoming>
      <bpmn:outgoing>flow_verdict_yes</bpmn:outgoing>
      <bpmn:outgoing>flow_verdict_no</bpmn:outgoing>
    </bpmn:exclusiveGateway>

    <bpmn:sequenceFlow id="flow_verdict_yes" name="Sí"
                       sourceRef="gw_verdict" targetRef="t_activate_supplier"/>
    <bpmn:sequenceFlow id="flow_verdict_no" name="No"
                       sourceRef="gw_verdict" targetRef="t_return_remediation"/>

    <!-- Lifecycle transition — always a Logic, never a lone CRUD: activating
         requires verifying the verdict first, and dispatches the notice. -->
    <bpmn:businessRuleTask id="t_activate_supplier" name="Activar proveedor">
      <bpmn:documentation>{"type":"logic","oid":"SP-03-03-L01","id":"activate-supplier","step":"Activar al proveedor habilitando compras y pagos","subprocess":"SP-03 Activación de proveedor","rules":["El veredicto de cumplimiento debe venir aprobado para activar; desde ese momento se habilitan contratos, facturas y pagos."],"composed":[{"oid":"SP-03-03-L01-C01","entity":"supplier","action":"update"},{"oid":"SP-03-03-L01-O01","content":"aviso de alta al área solicitante y al proveedor"}]}</bpmn:documentation>
      <bpmn:incoming>flow_verdict_yes</bpmn:incoming>
      <bpmn:outgoing>flow_011</bpmn:outgoing>
    </bpmn:businessRuleTask>

  </bpmn:process>
</bpmn:definitions>
```


## Sample docs/plan/bpmn.txt (full)

One section per subprocess block of `process.txt` (same count, order, ids,
names), separated by a blank line: the `SP-XX {name}` line, then each business
step with its operations. Top-level lines are only standalone crud
(`- {oid} crud: {action} {entity}`) and logic (`- {oid} logic: {kebab-id}`).
Under each logic, its composed members are indented two extra spaces with the
nested oid `{parent}-[C|L|O]AA` — CRUDs, Logic references, **and Outputs**.
**Outputs only ever appear composed inside a Logic, never as a top-level
line** (a notification is the effect of a rule resolving). Lines are concise:
crud = `{action} {entity}`, logic = bare kebab Action id, output = brief
content (never the channel).

```
SP-01 Registro de proveedor
Registrar al proveedor como pendiente, sin habilitar compras ni pagos
- SP-01-01-C01 crud: create supplier
Determinar el papeleo requerido según su tipo (empresa o persona natural)
- SP-01-02-L01 logic: build-required-file
  - SP-01-02-L01-C01 crud: create legal_document
  - SP-01-02-L01-O01 output: solicitud de papeleo al proveedor

SP-02 Validación de proveedor
Archivar la documentación del expediente
- SP-02-01-C01 crud: update legal_document
Registrar los datos operativos y los contactos por área
- SP-02-02-C01 crud: update supplier
- SP-02-02-C02 crud: create contact
Registrar la cuenta bancaria con su carta de respaldo
- SP-02-03-C01 crud: create financial_account
Verificar al proveedor contra las fuentes oficiales
- SP-02-04-L01 logic: verify-official-sources
  - SP-02-04-L01-C01 crud: create verification
Devolver el expediente al proveedor para corrección
- SP-02-06-L01 logic: return-file-for-correction
  - SP-02-06-L01-C01 crud: update supplier
  - SP-02-06-L01-O01 output: devolución del expediente para corrección
Enviar el caso a la revisión de cumplimiento
- SP-02-07-L01 logic: submit-to-compliance
  - SP-02-07-L01-C01 crud: update supplier

SP-03 Activación de proveedor
Registrar el veredicto de la revisión de cumplimiento en la ficha
- SP-03-01-L01 logic: record-compliance-verdict
  - SP-03-01-L01-C01 crud: read supplier
Activar al proveedor habilitando compras y pagos
- SP-03-03-L01 logic: activate-supplier
  - SP-03-03-L01-C01 crud: update supplier
  - SP-03-03-L01-O01 output: aviso de alta al área solicitante y al proveedor
Registrar los reparos y devolver el expediente a subsanación
- SP-03-05-L01 logic: return-for-remediation
  - SP-03-05-L01-C01 crud: update supplier

SP-04 Actualización de proveedor
Avisar al proveedor que debe renovar el documento
- SP-04-02-L01 logic: check-expiration
  - SP-04-02-L01-C01 crud: read legal_document
  - SP-04-02-L01-O01 output: aviso de renovación al proveedor
Verificar el respaldo documental recibido
- SP-04-03-C01 crud: update legal_document
Ejecutar la doble verificación del cambio de cuenta
- SP-04-05-L01 logic: verify-account-change
  - SP-04-05-L01-C01 crud: create verification
  - SP-04-05-L01-C02 crud: update financial_account
Actualizar la ficha y recalcular vencimientos
- SP-04-06-C01 crud: update supplier

SP-05 Evaluación de proveedor
Registrar y clasificar la observación en la ficha del proveedor
- SP-05-01-C01 crud: create performance_assessment
Escalar el caso para evaluar la suspensión
- SP-05-03-L01 logic: escalate-to-suspension
  - SP-05-03-L01-C01 crud: update performance_assessment
Dejar la nota como insumo para renovaciones y decisiones futuras
- SP-05-04-C01 crud: update performance_assessment

SP-06 Suspensión de proveedor
Suspender al proveedor y registrar el motivo, bloqueando compras y pagos nuevos
- SP-06-01-L01 logic: suspend-supplier
  - SP-06-01-L01-C01 crud: update supplier
  - SP-06-01-L01-O01 output: aviso de suspensión al proveedor y a las áreas usuarias

SP-07 Reactivación de proveedor
Verificar el respaldo de la regularización
- SP-07-01-L01 logic: verify-remediation
  - SP-07-01-L01-C01 crud: create verification
Reactivar al proveedor y notificar
- SP-07-03-L01 logic: reactivate-supplier
  - SP-07-03-L01-C01 crud: update supplier
  - SP-07-03-L01-O01 output: aviso de reactivación del proveedor
Mantener la suspensión e informar lo que falta
- SP-07-04-L01 logic: keep-suspended
  - SP-07-04-L01-C01 crud: update verification
  - SP-07-04-L01-O01 output: informe de lo que falta para regularizar

SP-08 Baja de proveedor
Registrar la baja, cerrar la ficha como inactiva y conservar el histórico
- SP-08-01-L01 logic: deactivate-supplier
  - SP-08-01-L01-C01 crud: update supplier
```
