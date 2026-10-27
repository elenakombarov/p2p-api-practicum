# Match leaves partial_receipt false when the last line is short

**Title:** Match leaves partial_receipt false when the last line is short

**Rule broken:** `partial_receipt_flag`

**Severity:** High. A receipt of $86.20 against an order of $243.00 was matched as complete, so $156.80 still outstanding was not flagged.

**Basis:** executed

**Steps to reproduce:**

`GET /skus` returned `LUM-2X4-8` at 4.75 and `PLY-12-4X8` at 22.4. A new active vendor. The purchase order orders 4 of `LUM-2X4-8` and 10 of `PLY-12-4X8`. After submit, the receipt takes 4 and 3. The invoice bills those received quantities. Then match.

```text
curl.exe -sS -X POST "http://localhost:8000/vendors" -H "Content-Type: application/json" --data-binary "{\"name\":\"P56 partial last\",\"active\":true}"
curl.exe -sS -X POST "http://localhost:8000/purchase-orders" -H "Content-Type: application/json" --data-binary "{\"vendor_id\":\"vnd-b041ae9a\",\"line_items\":[{\"sku\":\"LUM-2X4-8\",\"quantity\":4,\"unit_price\":4.75},{\"sku\":\"PLY-12-4X8\",\"quantity\":10,\"unit_price\":22.4}]}"
curl.exe -sS -X POST "http://localhost:8000/purchase-orders/po-1638c71a/submit"
curl.exe -sS -X POST "http://localhost:8000/purchase-orders/po-1638c71a/receive" -H "Content-Type: application/json" --data-binary "{\"items\":[{\"sku\":\"LUM-2X4-8\",\"quantity\":4},{\"sku\":\"PLY-12-4X8\",\"quantity\":3}]}"
curl.exe -sS -X POST "http://localhost:8000/invoices" -H "Content-Type: application/json" --data-binary "{\"po_id\":\"po-1638c71a\",\"invoice_number\":\"INV-PART-LAST\",\"line_items\":[{\"sku\":\"LUM-2X4-8\",\"quantity\":4,\"unit_price\":4.75},{\"sku\":\"PLY-12-4X8\",\"quantity\":3,\"unit_price\":22.4}]}"
curl.exe -sS -X POST "http://localhost:8000/invoices/inv-eaa9f15b/match"
```

The receive response had `"fully_received":false`, `"ordered_value":243`, and `"received_value":86.2`. `PLY-12-4X8` `received_quantity` was 3 of quantity 10.

**Expected:**

> The match result sets `partial_receipt` to `true` when any line of the PO is not fully received.

`docs/API.md` Business rules, rule 5.

**Actual:**

HTTP 200

```json
{"invoice_id":"inv-eaa9f15b","po_id":"po-1638c71a","status":"matched","matched":true,"partial_receipt":false,"ordered_value":243,"received_value":86.2,"invoice_total":86.2,"message":"3-way match passed."}
```

**What this proves:** `PLY-12-4X8` was not fully received, and the match still set `partial_receipt` to false. `received_value` 86.2 stayed below `ordered_value` 243.

**What this does not prove:** It does not prove the flag is wrong when the short line is the first line, or when a later line was not received at all.

**Open question:** `MATCH-04` also expects `partial_receipt` true when a later ordered line was not received, and that test fails today. This curl run did not use that setup.
