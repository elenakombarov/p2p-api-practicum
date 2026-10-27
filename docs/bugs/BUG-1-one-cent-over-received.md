# An invoice one cent over the received value is accepted

**Title:** An invoice one cent over the received value is accepted

**Rule broken:** `overpayment_protection`

**Severity:** High. This invoice bills $4.76 after $4.75 of goods were received, so $0.01 is payable with no tolerance.

**Basis:** executed

**Steps to reproduce:**

`GET /skus` returned catalog price `4.75` for `LUM-2X4-8`. A new active vendor, then a one-unit purchase order at that price, submitted and fully received (`received_value` 4.75). The invoice prices that one unit at 4.76.

```text
curl.exe -sS -X POST "http://localhost:8000/vendors" -H "Content-Type: application/json" --data-binary "{\"name\":\"P56 over cent\",\"active\":true}"
curl.exe -sS -X POST "http://localhost:8000/purchase-orders" -H "Content-Type: application/json" --data-binary "{\"vendor_id\":\"vnd-654c16b0\",\"line_items\":[{\"sku\":\"LUM-2X4-8\",\"quantity\":1,\"unit_price\":4.75}]}"
curl.exe -sS -X POST "http://localhost:8000/purchase-orders/po-3624e56b/submit"
curl.exe -sS -X POST "http://localhost:8000/purchase-orders/po-3624e56b/receive" -H "Content-Type: application/json" --data-binary "{\"items\":[{\"sku\":\"LUM-2X4-8\",\"quantity\":1}]}"
curl.exe -sS -X POST "http://localhost:8000/invoices" -H "Content-Type: application/json" --data-binary "{\"po_id\":\"po-3624e56b\",\"invoice_number\":\"INV-OVER-CENT\",\"line_items\":[{\"sku\":\"LUM-2X4-8\",\"quantity\":1,\"unit_price\":4.76}]}"
```

Receive response included `"received_value":4.75` and `"fully_received":true`.

**Expected:**

> Everything invoiced on a PO never exceeds what was received: not per line quantity, and not in total value. There is no tolerance.

`docs/API.md` Business rules, rule 3. A business rule that says no returns HTTP 400 and names that rule (`docs/API.md` Errors).

**Actual:**

HTTP 201

```json
{"id":"inv-d4003661","po_id":"po-3624e56b","vendor_id":"vnd-654c16b0","invoice_number":"INV-OVER-CENT","status":"received","line_items":[{"sku":"LUM-2X4-8","quantity":1,"unit_price":4.76}],"total_amount":4.76,"matched":false,"partial_receipt":null}
```

**What this proves:** After one unit was received at 4.75, `POST /invoices` for one unit at 4.76 created the invoice. `total_amount` is 4.76, one cent over `received_value` 4.75.

**What this does not prove:** It does not prove that a larger overrun is accepted, or that an invoice priced below the received value is rejected.

**Open question:** `docs/QUESTIONS.md` D.19 asks whether an invoice `unit_price` may differ from the purchase-order line. This run only shows that one cent above the received value was stored.
