# SIPOC — Record payment

**Identifier:** `record-payment`
**Business Rules:** BR-02
**Composes:** none

Records the customer's payment and moves the invoice from Issued to Paid.

## SIPOC

| Suppliers | Inputs | Process | Outputs | Customers |
|---|---|---|---|---|
| User | invoice | SP-02-02-L01-C01 | success | All callers |
|  |  |  | invoice | System |

## Suppliers
- User — Picks the Issued invoice the payment settles

## Inputs
| Input | Source | Type | Validation rules | Description |
|-------|--------|------|------------------|-------------|
| invoice | User | options | required | Issued invoice being paid |

## Process
1. `SP-02-02-L01-C01` Sets the Paid status (BR-02)
2. return result

## Outputs
| Output | Consumer | Type | Description |
|--------|----------|------|-------------|
| success | All callers | bool | Whether the payment was recorded |
| invoice | System | invoice | The paid invoice |

## Customers
- System — The billing flow, which closes

## Business Rules
- **BR-02** — Only an Issued invoice can be paid, and it is paid in full.

## Failure modes
- **Soft failure** (returns `success=false` + `message`): 
- **Hard failure** (throws): The invoice does not exist or is not Issued
