# Sample output — opscale-dbml

Excerpt of `docs/plan/dbml.dbml` from the **Proveedores** module (supplier
master lifecycle, `Dominio ERP`, project `compras/proveedores`) — the same
real module used across the Plan skills so the artifacts chain. The full set
passes every Plan validator. Shows the SHAPE of what the skill produces, not
the full output (7 tables, 10 enums in the real file).

Things the excerpt demonstrates: the Project Note with the modeling standard
(UBL/Peppol, chosen in Phase 1) and the bounded context; Enums for every
closed value set; business types as column types (`name`, `document`, `email`,
`bankAccount` — extended into the registry for this module — never
`varchar`); the kebab-id stamp opening every table Note; role-named
external-ref columns with the structured note; and indexes on status/FK
columns.

---

```dbml
Project proveedores {
  database_type: 'MySQL'

  Note: '''
  # Subdomain: Proveedores
  Source spec: docs/plan/process.json
  Modeling standard: UBL / Peppol (Universal Business Language — Party, SupplierParty, PartyLegalEntity, PartyTaxScheme, FinancialAccount, Contact, PaymentTerms)

  Registro maestro del proveedor en el dominio Compras: gobierna el ciclo de
  vida completo desde el alta hasta la baja (pending → under_review → active →
  suspended → inactive). Es prerrequisito de cualquier compra o pago. El módulo
  enriquece la ficha canónica del party (maestro de negocios); no duplica la
  identidad, la extiende con el rol proveedor.

  ## Bounded Context
  - Core entities: Supplier, LegalDocument, Contact, FinancialAccount, Verification, PerformanceAssessment, PaymentTerm
  - Main aggregates: Supplier → (LegalDocument, Contact, FinancialAccount, Verification, PerformanceAssessment, PaymentTerm)
  - Depends on: organizacion/negocios (party), cumplimiento/kyc (subject), recursos-humanos/expediente (employee)
  - Notifies: compras-recurrentes, compras-temporales, caja-chica, finanzas/flujo-de-caja
  '''
}

Enum supplier_status {
  pending       [note: 'Registrado con datos básicos, en sala de espera; sin habilitar compras ni pagos']
  under_review  [note: 'Expediente completo, en verificación oficial y revisión de cumplimiento']
  active        [note: 'Homologado; se le pueden registrar contratos, recibir facturas y autorizar pagos']
  suspended     [note: 'Bloqueado para compras y pagos nuevos; los contratos vigentes se honran']
  inactive      [note: 'Baja definitiva; ficha cerrada, histórico conservado']
}

Enum financial_account_status {
  pending_verification  [note: 'Registrada, en doble verificación']
  active                [note: 'Verificada y vigente para pagos']
  rejected              [note: 'Rechazada en la verificación']
  superseded            [note: 'Reemplazada por un cambio de cuenta']
}

Table supplier {
  id                  identifier          [pk, note: 'ULID generated at application layer before insert']

  // --- Cross-subdomain logical references (role-named, no FK constraint) ---
  party_profile       identifier          [not null, note: '// external_ref:parties | negocios.party — ficha canónica que este rol enriquece']
  kyc_profile         identifier          [null, note: '// external_ref:subjects | kyc.subject — perfil de debida diligencia; se asigna al enviar el caso a cumplimiento']

  // --- Business attributes (business types as column types) ---
  name                name                [not null, note: 'Nombre comercial con el que se conoce al proveedor']
  legal_name          name                [not null, note: 'Razón social o nombre legal']
  tax_id              document            [not null, note: 'Identificación tributaria; exigida desde el registro básico']
  email               email               [null, note: 'Correo general de contacto']
  status              supplier_status     [not null, default: 'pending', note: 'Estado actual del ciclo de vida']
  criticality         criticality_level   [null, note: 'Criticidad ITIL; se clasifica al armar el expediente']

  created_at          timestamp           [not null]
  updated_at          timestamp           [not null]

  indexes {
    party_profile   [unique, name: 'idx_supplier_party_profile']
    status          [name: 'idx_supplier_status']
    tax_id          [name: 'idx_supplier_tax_id']
  }

  Note: '''
  supplier — El proveedor como rol de compras que enriquece la ficha canónica
  del party (maestro de negocios) sin duplicar su identidad. Es la raíz del
  agregado del módulo: gobierna el ciclo de vida completo (pending →
  under_review → active → suspended → inactive) y es prerrequisito de toda
  compra o pago.
  '''
}

Table financial_account {
  id              identifier                [pk, note: 'ULID generated at application layer before insert']
  supplier_id     identifier                [ref: > supplier.id, not null, note: 'Proveedor dueño de la cuenta']

  status          financial_account_status  [not null, default: 'pending_verification', note: 'Estado de la cuenta; un cambio marca la anterior como superseded']
  bank_name       name                      [not null, note: 'Nombre del banco']
  account_number  bankAccount               [not null, note: 'Número de cuenta bancaria']
  account_type    financial_account_type    [not null, note: 'Tipo de cuenta: corriente o ahorro']
  holder_name     name                      [not null, note: 'Titular a cuyo nombre está la cuenta']

  created_at      timestamp                 [not null]
  updated_at      timestamp                 [not null]

  indexes {
    supplier_id [name: 'idx_financial_account_supplier_id']
    status      [name: 'idx_financial_account_status']
  }

  Note: '''
  financial-account — Cuenta bancaria del proveedor para los pagos. El cambio
  de cuenta es un punto sensible al fraude: no se pisa la cuenta previa, se
  crea un registro nuevo que pasa por doble verificación y la anterior queda
  como superseded, preservando el historial.
  '''
}

// External references NEVER get a Ref line — the target table is not declared
// in this file, so @dbml/core would reject it. They live ONLY as column notes
// ('// external_ref:parties' above) and in context/external-refs.md.
```

## Sample docs/plan/context/external-refs.md

````markdown
# External references — Proveedores

```external-refs
parties:   party_profile
subjects:  kyc_profile
employees: verified_by, assessed_by
```
````

## Sample docs/plan/dbml.json

One entity per line, exactly the `Table` blocks of `dbml.dbml`, same order —
the cheap diff surface for entity coverage across the Plan artifacts.

```
supplier
legal_document
contact
financial_account
verification
performance_assessment
payment_term
```
