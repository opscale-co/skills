# Sample output — opscale-graph

Excerpt of `docs/plan/graph.json` + `docs/plan/graph.html` for the
**Proveedores** module (supplier master lifecycle, `Dominio ERP`, project
`compras/proveedores`) — the same real module used by the samples of the
other Plan skills: every Logic shown here has a file in `sipoc/` and a block
in `sipoc.json`, every entity named in a CRUD exists in `dbml.json`, every step
appears in `process.json` and `bpmn.json`. The full files (8 subprocesses,
32 steps, 15 Logics) pass `validate-graph.mjs`.

Shows the SHAPE, not the full module (excerpt: SP-01 to SP-03 of 8).

---

What the excerpt demonstrates:

- `graph.json` is the schema-validated source of truth: a **nested hierarchy**
  of lightweight `{id, ref}` elements — `module` (a ref into `process.json`) →
  `subprocesses[]` → `steps[]` → `operations[]` → composed `operations[]`.
  Every element carries its ontology id plus a JSON Pointer `ref` into the file
  that owns its content; nothing is duplicated. There are no entity/enum/
  business-rule nodes — those registries live in `dbml.json`/`sipoc.json`.
- **Every id is its ontology id**: `SP-XX` (subprocess), `SP-XX-YY` (step), the
  operation oid `SP-XX-YY-[C|L]ZZ` (nested `…-[C|L|O]AA` on composed members).
- `graph.html` is the deterministic, **self-contained** projection — an
  interactive card tree that starts collapsed with only the **module** card
  showing. Clicking drills module → subprocess → step → operation. A **CRUD**
  operation opens its **entity** card (name, description, fields/types from
  `dbml.json`); a **Logic** operation opens its **logic** card (SIPOC detail
  from `sipoc.json`) and reveals its nested composed child operations; an
  **Output** operation is a leaf. All card content is inlined at render time by
  dereferencing each node's `ref` — no network, no external files.
- The readable outline below renders the same hierarchy as plain text with
  2-space indent and category words (crud / logic / output), mirroring the
  cards you would expand in `graph.html`.

## docs/plan/graph.html — card tree (same excerpt, as a readable outline)

The interactive page opens collapsed (module card only). Expanding every card
yields this hierarchy — CRUDs reveal an entity card, Logics reveal a SIPOC card
plus their composed children:

```
Proveedores (module)                                   ← Compras · Dominio ERP
  SP-01 Registro de proveedor (subprocess)
    SP-01-01 Registrar al proveedor como pendiente… (step)
      SP-01-01-C01 create supplier (crud → entity: supplier)
    SP-01-02 Determinar el papeleo requerido… (step)
      SP-01-02-L01 build-required-file [BR-01] (logic → SIPOC)
        SP-01-02-L01-C01 create legal_document (crud → entity: legal-document)
        SP-01-02-L01-O01 solicitud de papeleo al proveedor (output)
    SP-01-03 Solicitar el papeleo al proveedor (step)
  SP-02 Validación de proveedor (subprocess)
    SP-02-04 Verificar al proveedor contra las fuentes oficiales (step)
      SP-02-04-L01 verify-official-sources [BR-02] (logic → SIPOC)
        SP-02-04-L01-C01 create verification (crud → entity: verification)
    SP-02-06 Devolver el expediente al proveedor para corrección y retomar (step)
      SP-02-06-L01 return-file-for-correction [BR-03] (logic → SIPOC)
        SP-02-06-L01-C01 update supplier (crud → entity: supplier)
        SP-02-06-L01-O01 devolución del expediente para corrección (output)
  SP-03 Activación de proveedor (subprocess)
    SP-03-03 Activar al proveedor habilitando compras y pagos (step)
      SP-03-03-L01 activate-supplier [BR-06] (logic → SIPOC)
        SP-03-03-L01-C01 update supplier (crud → entity: supplier)
        SP-03-03-L01-O01 aviso de alta al área solicitante y al proveedor (output)
```

## Readable outline of docs/plan/graph.json (same excerpt)

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
