# SIPOC — Issue invoice

**Identifier:** `issue-invoice`
**Business Rules:** BR-01
**Composes:** none

Validates the invoice totals and moves it from Draft to Issued.

## SIPOC

| Suppliers | Inputs | Process | Outputs | Customers |
|---|---|---|---|---|
| User | invoice | SP-01-03-L01-C01 | success | All callers |
|  |  |  | invoice | System |

## Suppliers
- User — Picks the Draft invoice to issue

## Inputs
| Input | Source | Type | Validation rules | Description |
|-------|--------|------|------------------|-------------|
| invoice | User | options | required | Draft invoice to issue |

## Process
1. `SP-01-03-L01-C01` Sets the total, the issue moment and the Issued status (BR-01)
2. return result

## Outputs
| Output | Consumer | Type | Description |
|--------|----------|------|-------------|
| success | All callers | bool | Whether the invoice was issued |
| invoice | System | invoice | The issued invoice |

## Customers
- User — The customer who receives the invoice

## Business Rules
- **BR-01** — Only a Draft invoice with at least one item can be issued; its total is the sum of its line totals.

## Failure modes
- **Soft failure** (returns `success=false` + `message`): The invoice has no items
- **Hard failure** (throws): The invoice does not exist or is not Draft
