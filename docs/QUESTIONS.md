# P2P Practice API — documentation questions

Sources compared:

- Written reference: `docs/API.md`
- Generated specification: `GET /openapi.json` (OpenAPI 3.1.0, title `P2P Practice API`, version `1.0.0`)

`src/` was not read. No purchase-order, invoice, vendor, catalog, reset, match, or approve request was sent while preparing this note. Section B lists only requests that were actually executed.

---

## A. Documented

Facts below are stated by `docs/API.md`, by `GET /openapi.json`, or by both. Each row cites the source.

### A.1 Platform

| Fact | Source |
| --- | --- |
| Base URL is `http://localhost:8000`. | `docs/API.md` lines 11; OpenAPI `#/servers/0/url` |
| The port can be changed with `PORT=8001 npm start`. | `docs/API.md` line 11. OpenAPI does not mention `PORT`. |
| Request and response bodies are JSON. Every body must be sent with `Content-Type: application/json`. | `docs/API.md` line 12. OpenAPI request bodies that exist are `application/json`. |
| There is no authentication. | `docs/API.md` line 13; OpenAPI `#/info/description` |
| Data is kept in memory. A process restart or `POST /admin/reset` restores the seed data. | `docs/API.md` line 14; OpenAPI `#/info/description` and `#/paths/~1admin~1reset/post/description` |
| Money is dollars, rounded to cents (two decimals). | `docs/API.md` line 15. OpenAPI repeats "Amount in dollars, rounded to cents." on the money fields listed in A.4. |
| The server creates ids prefixed `vnd-`, `po-`, and `inv-`. Seed vendors use fixed ids. | `docs/API.md` line 16 |
| When the written reference and the OpenAPI document disagree, or neither answers a question, the question should be written down. | `docs/API.md` lines 3–5 |
| Swagger UI is at `/docs`. The OpenAPI document is at `/openapi.json`. | `docs/API.md` line 3. Those two paths are not operations in the OpenAPI `paths` object. |
| The same happy path can be run with `npm run smoke`. | `docs/API.md` line 232 |

### A.2 Endpoints and methods

These are the only operations in OpenAPI `paths`. `docs/API.md` lines 93–211 describes the same fourteen operations. No other HTTP method is documented on any of them.

| Method and path | Success | Other statuses documented on that operation | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| `GET /health` | 200 | none | none | `Health` |
| `POST /admin/reset` | 200 | none | none | `Reset` |
| `GET /vendors` | 200 | none | none | array of `Vendor` |
| `POST /vendors` | 201 | 400 | `VendorCreate` | `Vendor` |
| `GET /vendors/{vendorId}/exposure` | 200 | 404 | path `vendorId` (string) | `VendorExposure` |
| `GET /skus` | 200 | none | none | array of `Sku` |
| `POST /purchase-orders` | 201 | 400, 404 | `PurchaseOrderCreate` | `PurchaseOrder` |
| `GET /purchase-orders/{poId}` | 200 | 404 | path `poId` (string) | `PurchaseOrder` |
| `POST /purchase-orders/{poId}/submit` | 200 | 400, 404 | path `poId` only; no body | `PurchaseOrder` |
| `POST /purchase-orders/{poId}/receive` | 200 | 400, 404 | `ReceiveRequest` | `PurchaseOrder` |
| `POST /invoices` | 201 | 400, 404 | `InvoiceCreate` | `Invoice` |
| `GET /invoices/{invoiceId}` | 200 | 404 | path `invoiceId` (string) | `Invoice` |
| `POST /invoices/{invoiceId}/match` | 200 | 400, 404 | path `invoiceId` only; no body | `MatchResult` |
| `POST /invoices/{invoiceId}/approve` | 200 | 400, 404 | path `invoiceId` only; no body | `ApproveResult` |

Operation sources: OpenAPI `#/paths`. The matching prose is `docs/API.md` lines 97–199. The curl session (`docs/API.md` lines 218–229) sends no body on submit, match, approve, reset, or exposure.

Documented success meanings (`docs/API.md` lines 31–33):

- 200: the action worked.
- 201: a new vendor, purchase order, or invoice was created.
- OpenAPI assigns 201 only to `POST /vendors`, `POST /purchase-orders`, and `POST /invoices`. Submit, receive, match, approve, and reset are 200.

### A.3 Status codes and error body

| Fact | Source |
| --- | --- |
| A rejected request returns JSON with a human-readable `detail`. | `docs/API.md` lines 20–21; OpenAPI `#/info/description`; schema `Error` requires `detail` |
| If input validation or a business rule rejects the request, the body also has `rule`. | `docs/API.md` lines 20–21 |
| 400 means the body is invalid or a business rule said no. `rule` is `validation_error` or one of the 11 rule names. | `docs/API.md` line 33 |
| 404 means the record or the route does not exist. `rule` is not present. | `docs/API.md` line 34 |
| OpenAPI repeats that 404 responses have no `rule`. | OpenAPI `#/info/description`; `#/components/schemas/Error/properties/rule/description` |
| `Error.rule` is not required. `Error.detail` is required. | OpenAPI `#/components/schemas/Error/required` |
| `Error.rule` enum is the 11 rule names plus `validation_error`. | OpenAPI `#/components/schemas/Error/properties/rule/enum` |
| `POST /vendors` 400 description is "Invalid body (rule: validation_error)." | OpenAPI `#/paths/~1vendors/post/responses/400` |
| `POST /purchase-orders` 400 is "Invalid body or inactive vendor." 404 is "Vendor not found." | OpenAPI `#/paths/~1purchase-orders/post/responses` |
| `POST /purchase-orders/{poId}/submit` 400 is "The purchase order is not a draft." 404 is "Purchase order not found." | OpenAPI `#/paths/~1purchase-orders~1{poId}~1submit/post/responses` |
| `POST /purchase-orders/{poId}/receive` 400 is "Invalid body, wrong status or over-receipt." 404 is "Purchase order not found." | OpenAPI `#/paths/~1purchase-orders~1{poId}~1receive/post/responses` |
| `POST /invoices` 400 is "Invalid body or a business rule rejected the invoice." 404 is "Purchase order not found." | OpenAPI `#/paths/~1invoices/post/responses` |
| `POST /invoices/{invoiceId}/match` 400 is "The invoice is already approved." 404 is "Invoice not found." | OpenAPI `#/paths/~1invoices~1{invoiceId}~1match/post/responses` |
| `POST /invoices/{invoiceId}/approve` 400 is "Not matched, or already approved." 404 is "Invoice not found." | OpenAPI `#/paths/~1invoices~1{invoiceId}~1approve/post/responses` |
| `GET /vendors/{vendorId}/exposure` 404 is "Vendor not found." | OpenAPI `#/paths/~1vendors~1{vendorId}~1exposure/get/responses/404` |
| `GET /purchase-orders/{poId}` 404 is "Purchase order not found." | OpenAPI `#/paths/~1purchase-orders~1{poId}/get/responses/404` |
| `GET /invoices/{invoiceId}` 404 is "Invoice not found." | OpenAPI `#/paths/~1invoices~1{invoiceId}/get/responses/404` |

The inactive-vendor example bodies differ. See A.8.

### A.4 Request and response structures

Required properties are those listed in OpenAPI `required` unless noted as prose-only.

| Schema | Documented shape | Source |
| --- | --- | --- |
| `Health` | `status` enum `ok` | OpenAPI `Health`; `docs/API.md` line 97 |
| `Reset` | `status` enum `reset`. Reset deletes every purchase order, invoice, and created vendor, then restores the two seed vendors and the SKU catalog. | OpenAPI `Reset` and `POST /admin/reset` description; `docs/API.md` line 99 |
| `Vendor` | `id`, `name`, `active` (boolean) | OpenAPI `Vendor` |
| `VendorCreate` | `name` required. `active` optional, default `true`. | OpenAPI `VendorCreate`; `docs/API.md` lines 105–109 |
| `VendorExposure` | `vendor_id`, `open_ap_liability` (number, dollars rounded to cents), `approved_invoices` (array of strings) | OpenAPI `VendorExposure`; example at `docs/API.md` lines 113–118 |
| `Sku` | `sku`, `description`, `unit_price` (number, dollars rounded to cents) | OpenAPI `Sku` |
| `PoLineCreate` | `sku`, `quantity`, `unit_price` required. `description` optional, default `""`. | OpenAPI `PoLineCreate`; `docs/API.md` lines 127–137 |
| `PurchaseOrderCreate` | `vendor_id`, `line_items` required. `line_items` has at least one item. | OpenAPI `PurchaseOrderCreate`. The minimum length is not stated in `docs/API.md`. |
| `PurchaseOrder` | `id`, `vendor_id`, `status` (`draft`, `submitted`, `closed`), `line_items`, `ordered_value`, `received_value`, `fully_received` | OpenAPI `PurchaseOrder`; example at `docs/API.md` lines 141–153 |
| `PoLine` | `sku`, `description`, `quantity`, `unit_price`, `received_quantity` | OpenAPI `PoLine`; example at `docs/API.md` lines 146–147 |
| `ReceiveRequest` | `items` required, at least one item. Each item requires `sku` and `quantity`. | OpenAPI `ReceiveRequest`; example at `docs/API.md` line 163. The minimum length is not stated in `docs/API.md`. |
| `InvoiceCreate` | `po_id`, `invoice_number`, `line_items` required. `invoice_number` length at least 1. `line_items` at least one item. | OpenAPI `InvoiceCreate`; example at `docs/API.md` lines 170–178. Empty-string and empty-array limits are not stated in `docs/API.md`. |
| `InvoiceLine` | `sku`, `quantity`, `unit_price` | OpenAPI `InvoiceLine` |
| `Invoice` | `id`, `po_id`, `vendor_id`, `invoice_number`, `status` (`received`, `matched`, `approved`), `line_items`, `total_amount`, `matched` (boolean), `partial_receipt` (boolean or null). `partial_receipt` is null until the invoice is matched. | OpenAPI `Invoice`. `docs/API.md` line 168 states the create values `status: "received"`, `matched: false`, `partial_receipt: null`. It does not name `vendor_id` or `total_amount`. |
| `MatchResult` | `invoice_id`, `po_id`, `status` enum `matched` only, `matched` enum `true` only, `partial_receipt` (boolean), `ordered_value`, `received_value`, `invoice_total`, `message` | OpenAPI `MatchResult`; example at `docs/API.md` lines 185–196, including `message` "3-way match passed." |
| `GlLine` | `account`, `amount` | OpenAPI `GlLine` |
| `GlEntry` | `debits` (array of `GlLine`), `credits` (array of `GlLine`), `balanced` (boolean) | OpenAPI `GlEntry`; example at `docs/API.md` lines 205–209 |
| `ApproveResult` | `invoice_id`, `status` enum `approved` only, `gl_entry`, `vendor_exposure` (number, dollars rounded to cents) | OpenAPI `ApproveResult`; example at `docs/API.md` lines 201–211 |

Money fields that carry the "rounded to cents" description in OpenAPI: `VendorExposure.open_ap_liability`, `Sku.unit_price`, `PoLine.unit_price`, `PurchaseOrder.ordered_value`, `PurchaseOrder.received_value`, `Invoice.total_amount`, `MatchResult.ordered_value`, `MatchResult.received_value`, `MatchResult.invoice_total`, `GlLine.amount`, `ApproveResult.vendor_exposure`.

`GET /invoices/{invoiceId}` "returns the invoice with its current status" (`docs/API.md` line 180). Its OpenAPI response schema is `Invoice`, which has no `gl_entry`.

### A.5 Validation constraints

| Constraint | Source |
| --- | --- |
| Vendor `name` is required and cannot be empty (`minLength` 1). | `docs/API.md` line 105; OpenAPI `VendorCreate.name` |
| Vendor `active` defaults to `true` when omitted. | `docs/API.md` line 105; OpenAPI `VendorCreate.active` |
| PO `vendor_id` has `minLength` 1. | OpenAPI `PurchaseOrderCreate.vendor_id` |
| Every PO line needs `sku`, `quantity` greater than 0 and at most 10,000, and `unit_price` from 0 to 100,000. `description` is optional. | `docs/API.md` line 127 |
| OpenAPI encodes that quantity bound as `exclusiveMinimum: 0` and `maximum: 10000`, and that price bound as `minimum: 0` and `maximum: 100000`. `sku` has `minLength` 1. | OpenAPI `PoLineCreate` |
| The same quantity and price limits apply to deliveries and invoice lines. | `docs/API.md` line 127 |
| A delivery line has `sku` (`minLength` 1) and `quantity` (`exclusiveMinimum` 0, `maximum` 10000). It has no price field. | OpenAPI `ReceiveRequest` |
| An invoice line has `sku` (`minLength` 1), `quantity` (`exclusiveMinimum` 0, `maximum` 10000), and `unit_price` (`minimum` 0, `maximum` 100000). | OpenAPI `InvoiceLine` |
| Each SKU may appear once per purchase order. | `docs/API.md` line 127; OpenAPI `POST /purchase-orders` description. The schema has no uniqueness keyword. |
| PO `line_items`, receive `items`, and invoice `line_items` each have `minItems` 1. | OpenAPI `PurchaseOrderCreate`, `ReceiveRequest`, `InvoiceCreate` |
| Quantity and price fields are JSON `number`, not `integer`. | OpenAPI `PoLineCreate`, `ReceiveRequest`, `InvoiceLine` |
| No operation documents query parameters. The only parameters are the path ids `vendorId`, `poId`, and `invoiceId`, each a string. | OpenAPI `paths` |
| The catalog is for reference. A purchase order carries its own `unit_price` for each line. | `docs/API.md` line 73 |

### A.6 Business rules and workflow

Status changes only move forward (`docs/API.md` lines 49–54):

| Record | Statuses |
| --- | --- |
| Purchase order | `draft` → `submitted` → `closed` |
| Invoice | `received` → `matched` → `approved` |

OpenAPI enums match those sets: `PurchaseOrder.status`, `Invoice.status`. `MatchResult.status` is only `matched`. `ApproveResult.status` is only `approved`.

Documented flow (`docs/API.md` lines 40–47): choose an active vendor, create a draft PO, submit it, record deliveries (partial deliveries are allowed; the PO becomes `closed` when every line is fully received), record an invoice as `received`, match it so it becomes `matched`, approve it so it becomes `approved` and a ledger entry is posted, then read vendor exposure.

| # | Rule | Promise | Source |
| --- | --- | --- | --- |
| 1 | `inactive_vendor_gate` | No purchase order can be created for an inactive vendor. The vendor must exist (404) and be active. | `docs/API.md` line 81 and line 127; OpenAPI `POST /purchase-orders` description, 400 and 404 |
| 2 | `receive_quantity_limit` | Received quantity of a line never exceeds ordered quantity, across all deliveries. | `docs/API.md` line 82; OpenAPI `POST .../receive` description |
| 3 | `overpayment_protection` | Everything invoiced on a PO never exceeds what was received, per line quantity and in total value. There is no tolerance. | `docs/API.md` line 83; OpenAPI `POST /invoices` description ("quantities and total") |
| 4 | `three_way_match_gate` | An invoice cannot be approved until it passed the 3-way match. | `docs/API.md` line 84; OpenAPI `POST .../approve` description |
| 5 | `partial_receipt_flag` | The match result sets `partial_receipt` to `true` when any line of the PO is not fully received. | `docs/API.md` line 85; OpenAPI `POST .../match` description |
| 6 | `duplicate_invoice_detection` | A vendor cannot submit the same invoice number twice. Comparison ignores case and surrounding spaces. `INV-7`, `inv-7`, and ` INV-7 ` are the same number. Uniqueness is per vendor. | `docs/API.md` line 86; OpenAPI `POST /invoices` description |
| 7 | `gl_balance` | Every approval posts a balanced ledger entry: total debits equal total credits. | `docs/API.md` line 87 |
| 8 | `invoice_line_validation` | Every invoice line is for a SKU on the PO, and each SKU appears once. | `docs/API.md` line 88; OpenAPI `POST /invoices` description |
| 9 | `duplicate_approval` | An invoice can be approved only once. | `docs/API.md` line 89; OpenAPI `POST .../approve` description |
| 10 | `workflow_gate` | Submit only a draft. Receive only on a submitted PO. Invoice only a submitted or closed PO. Never match an approved invoice again. | `docs/API.md` line 90; OpenAPI descriptions of submit, receive, create invoice, and match |
| 11 | `vendor_exposure_math` | A vendor's exposure equals the sum of `total_amount` over that vendor's approved invoices. `open_ap_liability` is that sum. | `docs/API.md` line 91; OpenAPI `GET .../exposure` description |

Additional statements tied to those rules:

| Fact | Source |
| --- | --- |
| `POST /purchase-orders` creates a draft and returns 201. | `docs/API.md` line 127; OpenAPI 201 description "The new draft purchase order." The `PurchaseOrder` schema still allows all three statuses. |
| Submit moves a draft to `submitted`. Anything else is rejected. | `docs/API.md` line 158; OpenAPI submit description |
| Receive records a delivery on a submitted PO. Every SKU must be on the PO. The PO closes when every line is fully received. | `docs/API.md` lines 160–161; OpenAPI receive description (status, over-receipt, and closing). The OpenAPI 400 text does not say "unknown SKU". |
| Create invoice returns 201 and applies rules 3, 6, 8, and 10. | `docs/API.md` line 168 |
| Match runs the 3-way match and sets the partial-receipt flag (rule 5). | `docs/API.md` line 183 |
| Approve applies rules 4 and 9, posts the ledger entry (rule 7), and includes the vendor's new exposure (rule 11). | `docs/API.md` line 199 |
| The approve description names the accounts `5000 Materials Expense` (debit) and `2000 Accounts Payable` (credit). | OpenAPI `POST .../approve` description. The same two accounts appear in the worked example at `docs/API.md` lines 206–207. Rule 7's own sentence does not name accounts. |
| The worked PO example uses `ordered_value` 95.1 for 10 × 4.75 of `LUM-2X4-8` plus 4 × 11.9 of `CEM-30KG`, with `received_quantity` 0, `received_value` 0, and `fully_received` false. An omitted description is shown as `""`. | `docs/API.md` lines 141–153 |
| The worked match example shows `ordered_value`, `received_value`, and `invoice_total` all equal to 95.1, `partial_receipt` false, and `matched` true. | `docs/API.md` lines 185–196 |
| The worked approve example shows one debit and one credit of 95.1, `balanced` true, and `vendor_exposure` 95.1. | `docs/API.md` lines 201–211 |

### A.7 Seed data

Stated only by `docs/API.md` lines 56–71, after a start or a reset. OpenAPI says the two seed vendors and the SKU catalog are restored, and it does not list the rows.

| Vendor ID | Name | Active |
| --- | --- | --- |
| `vnd-001` | Maple Ridge Supply | yes |
| `vnd-002` | Old Quarry Materials | no |

| SKU | Description | Catalog price |
| --- | --- | --- |
| `LUM-2X4-8` | 2x4 stud, 8 ft | 4.75 |
| `PLY-12-4X8` | Plywood sheet, 1/2 in, 4x8 ft | 22.40 |
| `CEM-30KG` | Cement bag, 30 kg | 11.90 |
| `REB-10MM-6` | Rebar, 10 mm, 6 m | 18.25 |
| `SCR-DECK-1LB` | Deck screws, 1 lb box | 9.99 |

OpenAPI examples that match the written seed: vendor `vnd-001` / `Maple Ridge Supply`, and SKU `LUM-2X4-8` / `2x4 stud, 8 ft`. The OpenAPI example `unit_price` on `Sku` is 47.5, which is not the catalog price 4.75.

### A.8 Discrepancies between the two sources

1. **Inactive-vendor `detail` text.** `docs/API.md` lines 22–27 use `"Vendor vnd-002 is inactive. Purchase orders need an active vendor."` OpenAPI `Error.detail` example is `"Vendor vnd-002 is inactive."` Both call `detail` human-readable. Neither says the string is fixed.

2. **Example amounts and ids are not the same.** `docs/API.md` uses `po-0014ec8e`, `inv-1ad78dbb`, and 95.1. OpenAPI examples use `po-1a2b3c4d`, `inv-5e6f7a8b`, and 47.5, including on `Sku.unit_price`.

3. **Three rule names sit in the error enum without a rejection story.** `partial_receipt_flag`, `gl_balance`, and `vendor_exposure_math` are described as match output, a balanced posting, and a sum (`docs/API.md` lines 85–87 and 91). `docs/API.md` line 33 still allows any of the 11 names on a 400, and the OpenAPI `Error.rule` enum includes all three.

4. **Invoice fields appear only in OpenAPI.** `Invoice` requires `vendor_id` and `total_amount`. The invoice section of `docs/API.md` does not list them.

5. **Ledger account names are stronger in OpenAPI.** Rule 7 requires equal debit and credit totals. The account names are a worked example in `docs/API.md` and a normative sentence in the OpenAPI approve description.

6. **Empty collections and empty invoice numbers.** OpenAPI sets `minItems: 1` and `invoice_number.minLength: 1`. `docs/API.md` does not say an empty array or empty invoice number is rejected.

7. **Unknown routes.** `docs/API.md` line 34 says 404 when the route does not exist. OpenAPI documents 404 only for a missing vendor, purchase order, or invoice on specific operations.

8. **A match response cannot represent failure.** OpenAPI `MatchResult` allows only `status: matched` and `matched: true`. `docs/API.md` shows only the passing example. Neither source describes a failed match.

9. **Success schemas are wider than the prose.** Create-PO prose says the new PO is `draft`, but the 201 schema allows `submitted` and `closed`. Create-invoice prose fixes `received` / `matched: false` / `partial_receipt: null`, but the 201 schema is the full `Invoice` enum. `GlEntry.balanced` is a boolean, while rule 7 and the approve description say the posted entry is balanced.

10. **Seed rows and the port override are written only in `docs/API.md`.** OpenAPI states that reset restores two vendors and the catalog, and its server URL is fixed at `http://localhost:8000`.

11. **Unknown SKU on receive.** `docs/API.md` line 160 says every received SKU must be on the PO. The OpenAPI 400 description lists invalid body, wrong status, or over-receipt, and neither source names a `rule` for that case.

12. **Same exposure idea, two field names.** Rule 11 and the exposure endpoint call the sum `open_ap_liability`. The approve response calls it `vendor_exposure`. Neither source states that the two fields are equal.

---

## B. Observed

Only the requests below were executed. Nothing in this section was inferred from a document.

| Request | Result |
| --- | --- |
| `GET http://localhost:8000/health` | HTTP 200. Body: `{"status":"ok"}`. |
| `GET http://localhost:8000/docs` | HTTP 301. `Location: /docs/`. `Content-Type: text/html; charset=UTF-8`. `X-Powered-By: Express`. |
| `GET http://localhost:8000/docs/` | HTTP 200. HTML title `P2P Practice API`, with `swagger-ui.css`, `swagger-ui-bundle.js`, `swagger-ui-standalone-preset.js`, and `swagger-ui-init.js`. |
| `GET http://localhost:8000/openapi.json` | HTTP 200. Body is the OpenAPI 3.1.0 document cited in section A. |

Not observed, because these requests were not sent: reset, vendor list or create, exposure, SKU list, any purchase-order or invoice call, and any 400 or 404 body.

The trailing-slash redirect, the HTML content type, and `X-Powered-By` were seen on `GET /docs` only. They are not claims about the JSON API.

---

## C. Assumed

These are hypotheses. The documents do not confirm them.

1. `ordered_value`, `received_value`, `total_amount`, and `invoice_total` are each a sum of quantity times unit price, then rounded to cents. The worked example equals 10 × 4.75 + 4 × 11.9 = 95.1, and neither source writes that formula.
2. `MatchResult.invoice_total` is the same number as `Invoice.total_amount` for that invoice.
3. `ApproveResult.vendor_exposure` is the same number `GET /vendors/{vendorId}/exposure` returns in `open_ap_liability` after that approval.
4. A vendor with no approved invoices has `open_ap_liability` 0 and `approved_invoices` `[]`, because rule 11 defines exposure as a sum.
5. A repeated SKU on `POST /purchase-orders` is rejected with `rule` `validation_error`, because the documents require uniqueness and do not assign one of the 11 rule names.
6. A receive line whose SKU is not on the PO is HTTP 400, because the written reference forbids it and the operation's documented errors are 400 and 404.
7. A PO line stores the description the client sent. The worked example echoes it, and an omitted description is `""` in that example and in the OpenAPI default. The documents do not say the catalog description is copied.
8. A PO accepts any non-empty `sku`, including one that is not in the catalog, because the catalog is "for reference," the PO carries its own price, and `sku` is constrained only by `minLength` 1.

---

## D. Not Documented

Questions only. No answers are implied.

### Identifiers, money, and validation

1. What is the exact format of server-created `vnd-`, `po-`, and `inv-` ids beyond the prefix shown in `docs/API.md` line 16?
2. Which rounding mode does "rounded to cents" use? If a client sends more than two decimal places, is the value rejected or rounded?
3. Are non-integer quantities and prices accepted, given that OpenAPI types them as `number`?
4. Is a vendor `name` of only spaces rejected? `minLength` 1 allows a single space. Is `name` trimmed? Must vendor names be unique?
5. Are additional JSON properties rejected?
6. What is returned when `Content-Type: application/json` is missing or the body is not JSON? `docs/API.md` line 12 requires the header and does not give a status.
7. Are query parameters ignored?
8. What status and body are returned for an empty, unknown, or malformed `vendorId`, `poId`, or `invoiceId`?
9. If `POST` submit, match, or approve is sent with a JSON body, is that body rejected?
10. Is `detail` free text? The two inactive-vendor examples do not match (A.8.1). Should a test compare the exact `detail` string or only `rule` and the status?

### Catalog and purchase orders

11. Must a PO `sku` exist in the five-SKU catalog, or is any non-empty string accepted?
12. If the client description differs from the catalog description, which description is stored?
13. What status and `rule` are returned when a PO lists the same SKU twice?
14. What status and `rule` are returned when `line_items` is an empty array? OpenAPI says `minItems` 1. `docs/API.md` does not.
15. How are `ordered_value`, `received_value`, and `fully_received` defined? Is `fully_received` true only when every line's `received_quantity` equals its `quantity`?
16. Can one receive request repeat a SKU? If it does, are the quantities added together before rule 2 is applied?
17. What status and `rule` are returned when a delivery SKU is not on the PO?
18. Is a PO `closed` in the same response as the delivery that finishes the last line?
19. Can `unit_price` on an invoice differ from `unit_price` on the PO line?

### Invoices, match, and approval

20. What is the formula for `Invoice.total_amount`? Is `MatchResult.invoice_total` that same number?
21. Where does `Invoice.vendor_id` come from?
22. May invoice quantity or value be strictly less than what was received?
23. For rule 3, are quantity and value accumulated across every invoice on that PO, or checked one invoice at a time?
24. What status and `rule` are returned when an invoice breaks rule 3 or rule 8? Both are named in the create-invoice description. The 400 text does not map a `rule` value to each case.
25. Is any normalization other than case and surrounding spaces applied to invoice numbers? For example internal spaces.
26. Is an empty `invoice_number` a `validation_error`?
27. Does match re-check quantities and prices, or only set status and `partial_receipt`?
28. Can match return anything other than HTTP 200 with `matched: true`? If a match can fail, what status, `rule`, and `message` are used?
29. Can an invoice already in `matched` be matched again? Rule 10 forbids matching an approved invoice again and does not mention a second match of a matched invoice.
30. Which requests, if any, return `rule` `partial_receipt_flag`, `gl_balance`, or `vendor_exposure_math`?
31. On a successful approve, is `gl_entry` always one debit to `5000 Materials Expense` and one credit to `2000 Accounts Payable`, and is `balanced` always `true`?
32. Can the ledger entry be read again after approval? `GET /invoices/{invoiceId}` is documented as schema `Invoice`, which has no `gl_entry`.
33. Are `vendor_exposure` and `open_ap_liability` required to be equal for the same vendor at the same moment?
34. What does exposure return when the vendor exists and has no approved invoices? What is the order of `approved_invoices`, and are the strings always invoice ids?
35. Is exposure for an inactive but existing vendor (`vnd-002`) HTTP 200? The only documented error on that operation is 404 for an unknown vendor.

### Routes and lifetime

36. Is a request to an undocumented path HTTP 404 with `detail` and no `rule`, as `docs/API.md` line 34 says for a missing route?
37. Is the absence of list, update, and delete operations for vendors, purchase orders, invoices, and ledger entries intentional? No such paths are in either source.
38. Does `POST /admin/reset` restore the vendor names, active flags, SKU descriptions, and catalog prices in A.7 exactly, given that OpenAPI does not list those rows?
