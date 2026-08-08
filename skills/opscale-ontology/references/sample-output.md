# Sample output — opscale-ontology

Excerpt of `docs/plan/ontology.mmd` + `docs/plan/ontology.txt` for the
**Proveedores** module (supplier master lifecycle, `Dominio ERP`, project
`compras/proveedores`) — the same real module used by the samples of the
other Plan skills: every Logic shown here has a file in `sipoc/` and a block
in `sipoc.txt`, every entity named in a CRUD exists in `dbml.txt`, every step
appears in `process.txt` and `bpmn.txt`. The full files (8 subprocesses,
32 steps, 15 Logics) pass `validate-ontology.mjs`.

Shows the SHAPE, not the full module (excerpt: SP-01 to SP-03 of 8).

---

Format rules the excerpt demonstrates:

- `treeView-beta` header first; `%%` metadata lines next (module chain with
  the project id `xxx/yyy`, one `entity` line per stamped table of
  `dbml.dbml` — kebab id, business name, `names.md` aliases, table, enums —
  one `external` line per external-refs slug); then the tree — 4-space
  indentation, quoted labels, `/` suffix on nodes with children.
- **Every node label opens with its ontology id**: `SP-XX` (subprocess),
  `SP-XX-YY` (step), the operation oid `SP-XX-YY-[C|L]ZZ` (nested
  `…-[C|L|O]AA` on composed members).
- Category emojis: `⏳` subprocess, `⚙️` Logic (bare kebab Action id +
  `[BR-NN]` badges), `📝` CRUD (`{action} {entity}`), `📩` Output (brief
  content, never a channel). Steps and the top three levels carry no emoji.
- CRUDs and Outputs composed inside a Logic are children of the `⚙️` node —
  mirroring the indented lines of `bpmn.txt`, never duplicated at step level.
  (A composed Logic reference would appear as a leaf `⚙️` child — this module
  has none.)
- Steps that decomposed into flow elements only (a gateway question, a
  notification absorbed by a Logic) are leaf step nodes without children —
  they still appear because the step layer mirrors `process.txt` exactly.
- `ontology.txt` is the same tree as a plain outline: 2-space indent,
  category words instead of emojis.

## docs/plan/ontology.mmd (excerpt)

```
treeView-beta
%% module: compras/proveedores | domain: Compras (compras) | software: Dominio ERP
%% entity: supplier | Proveedor | proveedor, empresa nueva, persona natural, expediente | supplier | supplier_status, criticality_level
%% entity: legal-document | Documento legal | escritura, NIT, poder, carta de cuenta, certificaciones | legal_document | legal_document_type, legal_document_status
%% entity: contact | Contacto | contacto técnico, comercial, administrativo | contact | contact_role
%% entity: financial-account | Cuenta bancaria | datos bancarios, banco, número y tipo de cuenta | financial_account | financial_account_status, financial_account_type
%% entity: verification | Verificación | consulta al fisco, confirmación en registro, doble verificación | verification | verification_type, verification_result
%% entity: performance-assessment | Evaluación de desempeño | observación, notas de plazos, calidad, respuesta | performance_assessment | assessment_type
%% entity: payment-term | Término de pago | — | payment_term | payment_term_type
%% external: ref:parties | party_profile
%% external: ref:subjects | kyc_profile
%% external: ref:employees | verified_by, assessed_by
    "Dominio ERP"/
        "Compras"/
            "Proveedores"/
                "⏳ SP-01 Registro de proveedor"/
                    "SP-01-01 Registrar al proveedor como pendiente, sin habilitar compras ni pagos"/
                        "📝 SP-01-01-C01 create supplier"
                    "SP-01-02 Determinar el papeleo requerido según su tipo (empresa o persona natural)"/
                        "⚙️ SP-01-02-L01 build-required-file [BR-01]"/
                            "📝 SP-01-02-L01-C01 create legal_document"
                            "📩 SP-01-02-L01-O01 solicitud de papeleo al proveedor"
                    "SP-01-03 Solicitar el papeleo al proveedor"
                "⏳ SP-02 Validación de proveedor"/
                    "SP-02-01 Archivar la documentación del expediente"/
                        "📝 SP-02-01-C01 update legal_document"
                    "SP-02-02 Registrar los datos operativos y los contactos por área"/
                        "📝 SP-02-02-C01 update supplier"
                        "📝 SP-02-02-C02 create contact"
                    "SP-02-03 Registrar la cuenta bancaria con su carta de respaldo"/
                        "📝 SP-02-03-C01 create financial_account"
                    "SP-02-04 Verificar al proveedor contra las fuentes oficiales"/
                        "⚙️ SP-02-04-L01 verify-official-sources [BR-02]"/
                            "📝 SP-02-04-L01-C01 create verification"
                    "SP-02-05 ¿Las verificaciones oficiales pasaron?"
                    "SP-02-06 Devolver el expediente al proveedor para corrección y retomar"/
                        "⚙️ SP-02-06-L01 return-file-for-correction [BR-03]"/
                            "📝 SP-02-06-L01-C01 update supplier"
                            "📩 SP-02-06-L01-O01 devolución del expediente para corrección"
                    "SP-02-07 Enviar el caso a la revisión de cumplimiento"/
                        "⚙️ SP-02-07-L01 submit-to-compliance [BR-04]"/
                            "📝 SP-02-07-L01-C01 update supplier"
                "⏳ SP-03 Activación de proveedor"/
                    "SP-03-01 Registrar el veredicto de cumplimiento en la ficha"/
                        "⚙️ SP-03-01-L01 record-compliance-verdict [BR-05]"/
                            "📝 SP-03-01-L01-C01 read supplier"
                    "SP-03-02 ¿El veredicto viene aprobado?"
                    "SP-03-03 Activar al proveedor habilitando compras y pagos"/
                        "⚙️ SP-03-03-L01 activate-supplier [BR-06]"/
                            "📝 SP-03-03-L01-C01 update supplier"
                            "📩 SP-03-03-L01-O01 aviso de alta al área solicitante y al proveedor"
                    "SP-03-04 Notificar el alta al área solicitante y al proveedor"
                    "SP-03-05 Registrar los reparos y devolver el expediente a subsanación"/
                        "⚙️ SP-03-05-L01 return-for-remediation [BR-07]"/
                            "📝 SP-03-05-L01-C01 update supplier"
```

## docs/plan/ontology.txt (same excerpt)

```
Dominio ERP
  Compras
    Proveedores
      SP-01 Registro de proveedor
        SP-01-01 Registrar al proveedor como pendiente, sin habilitar compras ni pagos
          SP-01-01-C01 crud: create supplier
        SP-01-02 Determinar el papeleo requerido según su tipo (empresa o persona natural)
          SP-01-02-L01 logic: build-required-file
            SP-01-02-L01-C01 crud: create legal_document
            SP-01-02-L01-O01 output: solicitud de papeleo al proveedor
        SP-01-03 Solicitar el papeleo al proveedor
      SP-02 Validación de proveedor
        SP-02-01 Archivar la documentación del expediente
          SP-02-01-C01 crud: update legal_document
        SP-02-02 Registrar los datos operativos y los contactos por área
          SP-02-02-C01 crud: update supplier
          SP-02-02-C02 crud: create contact
        SP-02-03 Registrar la cuenta bancaria con su carta de respaldo
          SP-02-03-C01 crud: create financial_account
        SP-02-04 Verificar al proveedor contra las fuentes oficiales
          SP-02-04-L01 logic: verify-official-sources
            SP-02-04-L01-C01 crud: create verification
        SP-02-05 ¿Las verificaciones oficiales pasaron?
        SP-02-06 Devolver el expediente al proveedor para corrección y retomar
          SP-02-06-L01 logic: return-file-for-correction
            SP-02-06-L01-C01 crud: update supplier
            SP-02-06-L01-O01 output: devolución del expediente para corrección
        SP-02-07 Enviar el caso a la revisión de cumplimiento
          SP-02-07-L01 logic: submit-to-compliance
            SP-02-07-L01-C01 crud: update supplier
      SP-03 Activación de proveedor
        SP-03-01 Registrar el veredicto de cumplimiento en la ficha
          SP-03-01-L01 logic: record-compliance-verdict
            SP-03-01-L01-C01 crud: read supplier
        SP-03-02 ¿El veredicto viene aprobado?
        SP-03-03 Activar al proveedor habilitando compras y pagos
          SP-03-03-L01 logic: activate-supplier
            SP-03-03-L01-C01 crud: update supplier
            SP-03-03-L01-O01 output: aviso de alta al área solicitante y al proveedor
        SP-03-04 Notificar el alta al área solicitante y al proveedor
        SP-03-05 Registrar los reparos y devolver el expediente a subsanación
          SP-03-05-L01 logic: return-for-remediation
            SP-03-05-L01-C01 crud: update supplier
```
