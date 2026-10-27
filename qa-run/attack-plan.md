# P2P adversary attack plan

Base URL: `http://localhost:8000`

Each attack uses a new vendor and a new purchase order. SKUs and catalog prices come from one `GET /skus` after this plan. No vendor id or SKU is chosen in advance. Setup calls are not logged. The logged request is the one that tests the rule.

Catalog use after `GET /skus`:

- SKU-A: first catalog row, at its catalog `unit_price`, unless the attack names a different price.
- SKU-B: second catalog row, at its catalog `unit_price`, unless the attack names a different price.

Ordered quantities below are the attack quantities, not catalog data.

## Mandatory attacks (CHALLENGE.md)

### 1. `three_way_match_gate` — approve an unmatched invoice

Create an active vendor. Draft PO: SKU-A, quantity 10, catalog price. Submit. Receive all 10. Invoice that line exactly (`INV-MATCH-SKIP`). Do not match. `POST /invoices/{id}/approve`.

Expected (`Business rules` rule 4, `Invoices`): HTTP 400 and `rule` `three_way_match_gate`.

### 2. `receive_quantity_limit` — receive more than ordered

Create an active vendor. Draft PO: SKU-A, quantity 5, catalog price. Submit. `POST .../receive` with quantity 12.

Expected (`Business rules` rule 2, `Purchase orders`): HTTP 400 and `rule` `receive_quantity_limit`.

### 3. `overpayment_protection` — invoice a small percentage over the received value

Create an active vendor. Draft PO: SKU-A, quantity 10, catalog price. Submit. Receive all 10. Invoice quantity 10 at a unit price about 10% above the catalog price (rounded to cents), number `INV-OVER-PCT`.

Expected (`Business rules` rule 3, `Invoices`): HTTP 400 and `rule` `overpayment_protection`.

### 4. `inactive_vendor_gate` — order from an inactive vendor

`POST /vendors` with `active` false (not a seed vendor). `POST /purchase-orders` for that vendor: SKU-A, quantity 5, catalog price.

Expected (`Business rules` rule 1, `Purchase orders`): HTTP 400 and `rule` `inactive_vendor_gate`.

## Edge cases

### 5. `receive_quantity_limit` — one unit over ordered

Create an active vendor. Draft PO: SKU-A, quantity 5, catalog price. Submit. Receive quantity 6.

Expected (`Business rules` rule 2): HTTP 400 and `rule` `receive_quantity_limit`.

### 6. `overpayment_protection` — one cent over the received value

Create an active vendor. Draft PO: SKU-A, quantity 1, catalog price. Submit. Receive 1. Invoice quantity 1 at catalog price plus 0.01, number `INV-OVER-CENT`.

Expected (`Business rules` rule 3): HTTP 400 and `rule` `overpayment_protection`.

### 7. `overpayment_protection` — two invoices together exceed what was received

Create an active vendor. Draft PO: SKU-A, quantity 10, catalog price. Submit. Receive all 10. First invoice quantity 6 at the catalog price, number `INV-CUM-1` (within what was received; setup). Second invoice quantity 6 at the catalog price, number `INV-CUM-2`. Each invoice alone is under the received quantity; together they exceed it. Log the second invoice.

Expected (`Business rules` rule 3): HTTP 400 and `rule` `overpayment_protection`.

### 8. `validation_error` — quantity 0

Create an active vendor. `POST /purchase-orders` with SKU-A, quantity 0, catalog price.

Expected (`Purchase orders`, `Errors`): HTTP 400 and `rule` `validation_error`. Quantity must be greater than 0.

### 9. `validation_error` — negative quantity

Create an active vendor. `POST /purchase-orders` with SKU-A, quantity -1, catalog price.

Expected (`Purchase orders`, `Errors`): HTTP 400 and `rule` `validation_error`.

### 10. `validation_error` — negative unit price

Create an active vendor. `POST /purchase-orders` with SKU-A, quantity 1, `unit_price` -1.

Expected (`Purchase orders`, `Errors`): HTTP 400 and `rule` `validation_error`.

### 11. `validation_error` — unit price 0

Create an active vendor. `POST /purchase-orders` with SKU-A, quantity 1, `unit_price` 0.

Expected (`Purchase orders`): `unit_price` from 0 to 100,000 includes 0, so HTTP 201 is correct. An accepted zero price is not a bug.

### 12. `duplicate_invoice_detection` — case only

Create an active vendor. Draft PO: SKU-A, quantity 10, catalog price. Submit. Receive all 10. Invoice quantity 1, number `INV-7`. Then invoice quantity 1, number `inv-7`. Log the second invoice.

Expected (`Business rules` rule 6): HTTP 400 and `rule` `duplicate_invoice_detection`.

### 13. `duplicate_invoice_detection` — surrounding spaces only

Create an active vendor. Draft PO: SKU-A, quantity 10, catalog price. Submit. Receive all 10. Invoice quantity 1, number `INV-7`. Then invoice quantity 1, number ` INV-7 `. Log the second invoice.

Expected (`Business rules` rule 6): HTTP 400 and `rule` `duplicate_invoice_detection`.

### 14. `partial_receipt_flag` — short line first

Create an active vendor. Draft PO with two lines: SKU-A quantity 10, SKU-B quantity 4, catalog prices. Submit. Receive SKU-A quantity 3 (short) and SKU-B quantity 4 (full). Invoice those received quantities, number `INV-PART-FIRST`. `POST /invoices/{id}/match`. Log the match.

Expected (`Business rules` rule 5, `Invoices`): match result has `partial_receipt` true.

### 15. `partial_receipt_flag` — short line last

Create an active vendor. Draft PO with two lines: SKU-A quantity 4, SKU-B quantity 10, catalog prices. Submit. Receive SKU-A quantity 4 (full) and SKU-B quantity 3 (short). Invoice those received quantities, number `INV-PART-LAST`. Match. Log the match.

Expected (`Business rules` rule 5): `partial_receipt` true.

### 16. `gl_balance` — prices 0.1 and 0.2

Create an active vendor. Draft PO: SKU-A quantity 1 at `unit_price` 0.1, SKU-B quantity 1 at `unit_price` 0.2. Submit. Receive both in full. Invoice the same lines, number `INV-GL-FLOAT`. Match. Approve. Log the approve.

Expected (`Business rules` rule 7, `Invoices`): approval posts a ledger entry with `balanced` true and total debits equal to total credits.

### 17. `workflow_gate` — receive on a draft

Create an active vendor. Draft PO: SKU-A, quantity 5, catalog price. Do not submit. `POST .../receive` quantity 5. Log the receive.

Expected (`Business rules` rule 10): HTTP 400 and `rule` `workflow_gate`.

### 18. `workflow_gate` — invoice a draft

Create an active vendor. Draft PO: SKU-A, quantity 5, catalog price. Do not submit. `POST /invoices` for that PO, number `INV-DRAFT`. Log the invoice.

Expected (`Business rules` rule 10): HTTP 400 and `rule` `workflow_gate`.

### 19. `workflow_gate` — match an approved invoice

Create an active vendor. Draft PO: SKU-A, quantity 2, catalog price. Submit. Receive 2. Invoice exactly, number `INV-REMATCH`. Match. Approve. `POST .../match` again. Log the second match.

Expected (`Business rules` rule 10): HTTP 400 and `rule` `workflow_gate`.

### 20. `duplicate_approval` — approve twice

Create an active vendor. Draft PO: SKU-A, quantity 2, catalog price. Submit. Receive 2. Invoice exactly, number `INV-APPROVE-TWICE`. Match. Approve. `POST .../approve` again. Log the second approve.

Expected (`Business rules` rule 9): HTTP 400 and `rule` `duplicate_approval`.

### 21. `invoice_line_validation` — SKU not on the purchase order

Create an active vendor. Draft PO: SKU-A only, quantity 5, catalog price. Submit. Receive 5. Invoice SKU-B only, quantity 1, catalog price, number `INV-SKU-OFF`. Log the invoice.

Expected (`Business rules` rule 8): HTTP 400 and `rule` `invoice_line_validation`.

### 22. `invoice_line_validation` — same SKU twice on one invoice

Create an active vendor. Draft PO: SKU-A, quantity 10, catalog price. Submit. Receive 10. Invoice two lines, both SKU-A, quantity 1 each, catalog price, number `INV-SKU-DUP`. Log the invoice.

Expected (`Business rules` rule 8): HTTP 400 and `rule` `invoice_line_validation`.

### 23. `vendor_exposure_math` — one approved invoice

Create an active vendor. Draft PO: SKU-A, quantity 2, catalog price. Submit. Receive 2. Invoice exactly, number `INV-EXPOSURE`. Match. Approve. `GET /vendors/{id}/exposure`. Log the exposure read.

Expected (`Business rules` rule 11, `Vendors`): exposure equals that invoice's `total_amount` (`open_ap_liability` on the exposure payload, and `vendor_exposure` on the approval).

## Coverage

| Rule | Attacks |
| --- | --- |
| `three_way_match_gate` | 1 |
| `receive_quantity_limit` | 2 |
| `overpayment_protection` | 3 |
| `inactive_vendor_gate` | 1 |
| `validation_error` (Purchase orders limits) | 4 |
| `duplicate_invoice_detection` | 2 |
| `partial_receipt_flag` | 2 |
| `gl_balance` | 1 |
| `workflow_gate` | 3 |
| `duplicate_approval` | 1 |
| `invoice_line_validation` | 2 |
| `vendor_exposure_math` | 1 |

11 documented business rules, 1–3 attacks each, plus the four required quantity and price checks. No `POST /admin/reset`.
