# API coverage

Inventory for the P2P Practice API on branch `reference`. Counts come from the test titles in `tests/api/`. A call made only to set up another test is not counted for that endpoint, even when a helper also runs `expectSchema`.

This file did not re-run the suite and did not call `POST /admin/reset`. `src/` was not read. Endpoint inventory is based on docs/QUESTIONS.md section A.2. Live OpenAPI verification was unavailable. `docs/API.md` describes the same fourteen operations. `GET /docs` and `GET /openapi.json` are not operations in that list.

## How a test is counted

Positive means a documented success status. Negative means HTTP 400 with `rule` `validation_error`. Error means a documented business-rule 400 or an unknown-id 404. Rows marked `assumed — ask` in a design were not implemented.

| Playwright tests | Count | What they are |
| --- | ---: | --- |
| Design rows with a `test()` | 142 | The five approved designs, excluding every `assumed — ask` row |
| `GET /health` | 1 | `tests/api/health.spec.ts` |
| `POST /admin/reset` | 1 | `tests/api/reset.setup.ts` (Playwright project `api-setup`) |
| Schema helper file | 4 | `tests/api/schema.spec.ts` |
| Total | 148 | |

Two of the four schema tests assert an endpoint and are included in the table below (`GET /vendors`, `GET /skus`). The other two do not assert an API response. They mutate a fetched vendor locally, or they call `expectSchema` with a schema name that does not exist. Table totals are therefore 146 endpoint tests. Adding those two helper tests makes 148.

## Endpoint coverage

| Method and endpoint | Positive | Negative | Error | Schema validation | Spec files | Coverage gaps |
| --- | ---: | ---: | ---: | --- | --- | --- |
| `GET /health` | 1 | 0 | 0 | Body is `{ "status": "ok" }`. `expectSchema` is not used, so schema `Health` is not checked by the helper. | `tests/api/health.spec.ts` | No design table. OpenAPI documents only 200, so 0 negative and 0 error match the contract. |
| `POST /admin/reset` | 1 | 0 | 0 | The dedicated test asserts status 200 only. Schema `Reset` and `status` `reset` are asserted inside `resetApi` when VLIST-01 and VLIST-03 run. Those two tests are counted under `GET /vendors`. | `tests/api/reset.setup.ts`. Schema check: `tests/api/vendors-and-catalog.spec.ts` | No design table. Documented body is not asserted by the setup test. OpenAPI documents only 200. |
| `GET /vendors` | 5 | 0 | 0 | Yes. Each item is checked against `Vendor` in `readVendors` and in `schema.spec.ts`. | `tests/api/vendors-and-catalog.spec.ts` (VLIST-01–VLIST-04). `tests/api/schema.spec.ts` (`GET /vendors matches Vendor`). | OpenAPI documents only 200. Not implemented: VLIST-05, VLIST-06. |
| `POST /vendors` | 4 | 5 | 0 | Yes. `Vendor` on 201. `Error` on 400. | `tests/api/vendors-and-catalog.spec.ts` (VND-01–VND-09) | OpenAPI documents 201 and 400, so 0 error matches the contract. Creates in other spec files are setup. Not implemented: VND-10–VND-15. |
| `GET /vendors/{vendorId}/exposure` | 8 | 0 | 1 | Yes. `VendorExposure` on 200. `Error` on 404. | `tests/api/approval-and-exposure.spec.ts` (EXP-01–EXP-09) | No body, so 0 negative matches the contract. Amounts use a returned `total_amount` or are left unasserted. Literal `95.1` is not asserted. Not implemented: EXP-10–EXP-17. |
| `GET /skus` | 4 | 0 | 0 | Yes. Each item is checked against `Sku` in `readSkus` and in `schema.spec.ts`. | `tests/api/vendors-and-catalog.spec.ts` (SKU-01–SKU-03). `tests/api/schema.spec.ts` (`GET /skus matches Sku`). | OpenAPI documents only 200. Not implemented: SKU-04, SKU-05. |
| `POST /purchase-orders` | 10 | 19 | 2 | Yes. `PurchaseOrder` on 201. `Error` on 400 and 404. | `tests/api/purchase-orders.spec.ts` (POC-01–POC-31) | Creates in later spec files are setup. Not implemented: POC-32–POC-43. |
| `GET /purchase-orders/{poId}` | 4 | 0 | 1 | Yes. `PurchaseOrder` on 200. `Error` on 404. | `tests/api/purchase-orders.spec.ts` (POGET-01–POGET-05) | No body, so 0 negative matches the contract. INV-03 reads a closed PO as a precondition of `POST /invoices` and is not counted here. Not implemented: POGET-06–POGET-09. |
| `POST /purchase-orders/{poId}/submit` | 1 | 0 | 3 | Yes. `PurchaseOrder` on 200. `Error` on 400 and 404. | `tests/api/purchase-orders.spec.ts` (SUBMIT-01–SUBMIT-04) | No body, so 0 negative matches the contract. Submits in later spec files are setup. Not implemented: SUBMIT-05–SUBMIT-08. |
| `POST /purchase-orders/{poId}/receive` | 9 | 11 | 4 | Yes. `PurchaseOrder` on 200. `Error` on 400 and 404. | `tests/api/receipts.spec.ts` (RCV-01–RCV-24) | Receives in later spec files are setup. Not implemented: RCV-25–RCV-36. |
| `POST /invoices` | 12 | 18 | 3 | Yes. `Invoice` on 201. `Error` on 400 and 404. | `tests/api/invoices.spec.ts` (INV-01–INV-33) | INV-33 is implemented and fails. See Possible bugs. Later spec files create invoices as setup. Not implemented: INV-34–INV-58, including the rule 3 and rule 8 rejections. |
| `GET /invoices/{invoiceId}` | 5 | 0 | 1 | Yes. `Invoice` on 200. `Error` on 404. | `tests/api/invoices.spec.ts` (INVGET-01–INVGET-06) | No body, so 0 negative matches the contract. Approval tests that GET an invoice only to read `total_amount` are not counted here. Not implemented: INVGET-07–INVGET-11. |
| `POST /invoices/{invoiceId}/match` | 4 | 0 | 2 | Yes. `MatchResult` on 200. `Error` on 400 and 404. | `tests/api/invoices.spec.ts` (MATCH-01–MATCH-06) | No body, so 0 negative matches the contract. MATCH-04 is implemented and fails. Match calls inside approve and exposure tests are preconditions, including the worked match figures on APR-02. Not implemented: MATCH-07–MATCH-14. |
| `POST /invoices/{invoiceId}/approve` | 5 | 0 | 3 | Yes. `ApproveResult` on 200. `Error` on 400 and 404. | `tests/api/approval-and-exposure.spec.ts` (APR-01–APR-08) | No body, so 0 negative matches the contract. `approveInvoice` in `invoices.spec.ts` is setup for INVGET-04 and MATCH-06 and is not counted here. Not implemented: APR-09–APR-13. |

No OpenAPI operation has zero tests. A zero in the negative or error column means the contract documents no status of that kind for the operation, except where the gaps column names a deferred design row.

Endpoint-test totals: 73 positive, 53 negative, 20 error, 146 tests. Plus 2 schema-helper tests that are not endpoint coverage: 148.

## Recorded suite result

The last full `npm run test:api` recorded for this practicum:

| Result | Count |
| --- | ---: |
| Total | 148 |
| Passed | 146 |
| Failed | 2 |
| Skipped | 0 |

The two failures are INV-33 and MATCH-04. This document does not treat them as fixed. They are not marked `test.fail()`. The 17 approval and exposure tests are part of the 146 passes. This inventory did not run the suite again.

## Assumed and deferred rows

These design rows were not implemented. They are `assumed — ask` or explicitly deferred. They are not counted in the table.

| Design | Not implemented | Count |
| --- | --- | ---: |
| `docs/test-design/vendors-and-catalog.md` | VLIST-05–VLIST-06, VND-10–VND-15, SKU-04–SKU-05 | 10 |
| `docs/test-design/purchase-orders.md` | POC-32–POC-43, POGET-06–POGET-09, SUBMIT-05–SUBMIT-08 | 20 |
| `docs/test-design/receipts.md` | RCV-25–RCV-36 | 12 |
| `docs/test-design/invoices.md` | INV-34–INV-58, INVGET-07–INVGET-11, MATCH-07–MATCH-14 | 38 |
| `docs/test-design/approval-and-exposure.md` | APR-09–APR-13, EXP-10–EXP-17 | 13 |
| Total deferred |  | 93 |

Implemented design rows are 142. Designed rows in those five files are 235 (142 + 93).

Deferred subjects, by the design files:

- Query parameters, extra JSON properties, missing or non-JSON content type, empty or malformed ids, id format beyond the documented prefix, rounding mode, and fractional quantities.
- Empty collections where OpenAPI sets `minItems` 1 and `docs/API.md` does not (POC-33, RCV-27, INV-44).
- Rule 3 (`overpayment_protection`) and rule 8 (`invoice_line_validation`) have no implemented rejection. The designs do not name a `rule` for those failures (INV-34–INV-39 and related rows).
- Rule 7 (`gl_balance`) and rule 11 (`vendor_exposure_math`) are asserted on HTTP 200. No row expects them as a 400 (APR-13, EXP-16).
- Empty exposure (`open_ap_liability` 0 and `approved_invoices` `[]`) is not asserted (EXP-11, D.34). EXP-02 and the pre-approval read in EXP-04 leave that shape unchecked.
- Inactive seed vendor `vnd-002` exposure is not asserted (EXP-10, D.35).
- `vendor_exposure` is not required to equal `open_ap_liability` (EXP-13, D.33).
- `approved_invoices` order is not asserted (EXP-12).
- Shared-server reset after a created purchase order is deferred (POGET-06, SUBMIT-05).
- Whether a receive or a later match returns `closed` on the finishing delivery stays open (D.18). Ready one-line setups do not assert that status.

## Possible bugs

These assertions are still the original ones. The failures below are the recorded suite result, not a new run.

### INV-33

- File: `tests/api/invoices.spec.ts`
- Rule 6, `duplicate_invoice_detection` (`docs/API.md`: comparison ignores case and surrounding spaces; `INV-7`, `inv-7`, and ` INV-7 ` are the same number).
- The test records `INV-7`, then expects HTTP 400 and `duplicate_invoice_detection` for `inv-7`, then the same for ` INV-7 `.
- Recorded result: a case-insensitive duplicate invoice number was accepted. Expected 400. Actual 201.
- The case-variant assertion runs before the surrounding-space assertion. A 201 on `inv-7` fails the test at that assertion.

### MATCH-04

- File: `tests/api/invoices.spec.ts`
- Rule 5, `partial_receipt` (`docs/API.md`: true when any line is not fully received).
- Setup submits the worked two-line purchase order, receives only `LUM-2X4-8` quantity 10, and invoices that one line. `CEM-30KG` stays unreceived.
- `expectMatch` requires HTTP 200, `status` `matched`, `matched` true, and `partial_receipt` true.
- Recorded result: the invoice was matched while the other ordered line was still unreceived. Expected `partial_receipt` true. Actual false.

## Inconsistencies

- `docs/test-design/vendors.md` is an earlier `POST /vendors` design. It says to reset before each case. The implemented suite follows `docs/test-design/vendors-and-catalog.md`. Reset runs once in `tests/api/reset.setup.ts`, and again inside VLIST-01 and VLIST-03. VND-01–VND-15 in `vendors.md` are the same cases as the catalog design. `vendors.md` is not a sixth implemented suite.
- OpenAPI `Sku.unit_price` example is 47.5. `docs/API.md` catalog price for `LUM-2X4-8` is 4.75 (`docs/QUESTIONS.md` A.8.2). SKU-01 asserts the `docs/API.md` prices and does not assert 47.5. SKU-05, which asks whether OpenAPI's silence on seed rows changes that, is not implemented. VLIST-01 likewise asserts the `docs/API.md` vendor rows while VLIST-06 stays deferred (D.38).
- OpenAPI `MatchResult` allows only `status` `matched` and `matched` true (`docs/QUESTIONS.md` A.8.8). MATCH-04 expects HTTP 200 with `partial_receipt` true. It does not expect a failed match. The recorded body had `partial_receipt` false.
- Rule 5, rule 7, and rule 11 appear in the error-rule enum without a documented rejection story (`docs/QUESTIONS.md` A.8.3). Tests treat rule 5 as match output and rules 7 and 11 as success checks.
- `GET /health` checks the body by equality and does not call `expectSchema`. Every other success body in the five design suites is checked with `expectSchema`.
- `tests/api/reset.setup.ts` does not check schema `Reset` or `{ "status": "reset" }`. Those checks exist only inside the vendor-list helper.
- The two non-endpoint tests in `tests/api/schema.spec.ts` are helper checks. They are not negative API coverage.

## Sources

- `docs/API.md`
- `docs/QUESTIONS.md` A.2 and A.8
- `docs/test-design/vendors-and-catalog.md`
- `docs/test-design/purchase-orders.md`
- `docs/test-design/receipts.md`
- `docs/test-design/invoices.md`
- `docs/test-design/approval-and-exposure.md`
- `tests/api/*.spec.ts`, `tests/api/reset.setup.ts`, `tests/api/helpers/schema.ts`
