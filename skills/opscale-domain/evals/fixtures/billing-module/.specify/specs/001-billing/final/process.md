# Billing — process spec

**Status:** PASS

## Name normalization

| Business name | Entity |
|---|---|
| Customer | customer |
| Invoice | invoice |
| Invoice line | invoice_item |

## Lifecycle

An operator registers a Customer, issues an Invoice with one or more line
items, and the invoice moves Draft → Issued → Paid (or Cancelled).

## Ordered flow

### Subprocess: Invoicing
1. 👤 Register the customer
2. 👤 Create the invoice with its items
3. ⚙️ Issue the invoice (Logic: validates totals, sets status Issued)
4. ⏳ Wait for payment

### Subprocess: Settlement
5. ⚙️ Record the payment (Logic: sets status Paid)

## Relations

- customer 1—N invoice
- invoice 1—N invoice_item
