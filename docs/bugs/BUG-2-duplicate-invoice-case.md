# A lower-case copy of invoice number INV-7 is accepted

**Title:** A lower-case copy of invoice number INV-7 is accepted

**Rule broken:** `duplicate_invoice_detection`

**Severity:** High. The same vendor bill of $4.75 was stored a second time as `inv-7`, so that amount can be approved twice.

**Basis:** executed

**Steps to reproduce:**

`GET /skus` returned catalog price `4.75` for `LUM-2X4-8`. A new active vendor, a purchase order for 10 units at that price, submitted and fully received. Two invoices on that purchase order, quantity 1 at 4.75. The first number is `INV-7`. The second is `inv-7`.

```text
curl.exe -sS -X POST "http://localhost:8000/vendors" -H "Content-Type: application/json" --data-binary "{\"name\":\"P56 duplicate case\",\"active\":true}"
curl.exe -sS -X POST "http://localhost:8000/purchase-orders" -H "Content-Type: application/json" --data-binary "{\"vendor_id\":\"vnd-6707e7c0\",\"line_items\":[{\"sku\":\"LUM-2X4-8\",\"quantity\":10,\"unit_price\":4.75}]}"
curl.exe -sS -X POST "http://localhost:8000/purchase-orders/po-34eb7937/submit"
curl.exe -sS -X POST "http://localhost:8000/purchase-orders/po-34eb7937/receive" -H "Content-Type: application/json" --data-binary "{\"items\":[{\"sku\":\"LUM-2X4-8\",\"quantity\":10}]}"
curl.exe -sS -X POST "http://localhost:8000/invoices" -H "Content-Type: application/json" --data-binary "{\"po_id\":\"po-34eb7937\",\"invoice_number\":\"INV-7\",\"line_items\":[{\"sku\":\"LUM-2X4-8\",\"quantity\":1,\"unit_price\":4.75}]}"
curl.exe -sS -X POST "http://localhost:8000/invoices" -H "Content-Type: application/json" --data-binary "{\"po_id\":\"po-34eb7937\",\"invoice_number\":\"inv-7\",\"line_items\":[{\"sku\":\"LUM-2X4-8\",\"quantity\":1,\"unit_price\":4.75}]}"
```

The first invoice returned HTTP 201 with `invoice_number` `INV-7` and `total_amount` 4.75.

**Expected:**

> A vendor cannot submit the same invoice number twice. Numbers are compared ignoring upper or lower case and surrounding spaces, so `INV-7`, `inv-7` and ` INV-7 ` are the same number.

`docs/API.md` Business rules, rule 6. A business rule that says no returns HTTP 400 and names that rule (`docs/API.md` Errors).

**Actual:**

The second invoice, `inv-7`, returned HTTP 201.

```json
{"id":"inv-b59eb841","po_id":"po-34eb7937","vendor_id":"vnd-6707e7c0","invoice_number":"inv-7","status":"received","line_items":[{"sku":"LUM-2X4-8","quantity":1,"unit_price":4.75}],"total_amount":4.75,"matched":false,"partial_receipt":null}
```

**What this proves:** On vendor `vnd-6707e7c0`, `INV-7` and `inv-7` were both created. Each `total_amount` is 4.75.

**What this does not prove:** This run did not send ` INV-7 ` with surrounding spaces, and it did not send `INV-7` a second time with the same letters and case.

**Open question:** The rule also treats surrounding spaces as the same number. This execution did not resend that form.
