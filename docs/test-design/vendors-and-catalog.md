# Vendors and catalog

Design only. No test code until this table is approved.

Scope is `GET /vendors`, `POST /vendors`, and `GET /skus`. `GET /vendors/{vendorId}/exposure` is not in this document.

Setup for every row: `POST /admin/reset` first, so created vendors do not leak between cases (`docs/API.md` System). `POST /vendors` rows send `Content-Type: application/json` except VND-14. The two GET operations have no documented body or query parameters.

`POST /vendors` rows VND-01 through VND-15 are the same cases as `docs/test-design/vendors.md`.

Documented contract:

- `GET /vendors` returns 200 and an array of `Vendor` (`id`, `name`, `active`). No other status is documented (OpenAPI `GET /vendors`; `docs/API.md` Vendors).
- After a start or a reset, the list is the two seed vendors (`docs/API.md` Seed data). OpenAPI says reset restores two seed vendors and does not list the rows. The OpenAPI `Vendor` example matches `vnd-001` / `Maple Ridge Supply`.
- `POST /vendors` returns 201 and a `Vendor`. `name` is required, `minLength` 1. `active` defaults to `true`. Invalid body is 400 with `rule` `validation_error`. Exact `detail` text is not asserted (`docs/QUESTIONS.md` D.10). None of the 11 business rules reject this call. It takes no id, so it has no 404.
- `GET /skus` returns 200 and an array of `Sku` (`sku`, `description`, `unit_price`). No other status is documented (OpenAPI `GET /skus`; `docs/API.md` Catalog).
- The five catalog rows and their prices are the `docs/API.md` seed table. The OpenAPI `Sku.unit_price` example is 47.5, which is not that catalog price. Do not assert 47.5. Array order is not documented for either list, so do not assert order.

## GET /vendors

No request options or defaults are documented. The seed list itself includes one active and one inactive vendor.

| ID | type (positive / negative / error) | what we send | expected status | expected body (rule, key values) | source (API.md section or OpenAPI schema) | technique |
| --- | --- | --- | --- | --- | --- | --- |
| VLIST-01 | positive | `GET /vendors` after reset | 200 | Array of `Vendor`. Contains `vnd-001` / `Maple Ridge Supply` / `active` true and `vnd-002` / `Old Quarry Materials` / `active` false, and no other vendors. Order is not asserted. | `docs/API.md` Seed data (after a start or a reset, those two vendor rows) and System (reset restores the seed data); `docs/API.md` Vendors; OpenAPI `GET /vendors` 200, schema `Vendor` | Main success. |
| VLIST-02 | positive | `POST /vendors` with `{ "name": "Cedar Point Hardware" }`, then `GET /vendors` | 200 | The two seed vendors are still present. The list also contains the created vendor: `name` `Cedar Point Hardware`, `active` true, `id` prefixed `vnd-`. | `docs/API.md` Vendors (list all; create); OpenAPI `Vendor` | State: list after create. Default `active` true. |
| VLIST-03 | positive | Create `{ "name": "Cedar Point Hardware" }`, then `POST /admin/reset`, then `GET /vendors` | 200 | Array of `Vendor`. Contains `vnd-001` / `Maple Ridge Supply` / `active` true and `vnd-002` / `Old Quarry Materials` / `active` false, and no other vendors. The created vendor is absent. Order is not asserted. | `docs/API.md` System (reset deletes created vendors and restores the seed data) and Seed data (after a reset, those two vendor rows). OpenAPI `POST /admin/reset` also deletes created vendors and restores the two seed vendors; it does not list the rows. | State: list after reset. |
| VLIST-04 | positive | `GET /vendors` twice, with no write between the calls | 200 | Both responses are arrays of the same vendor `id` values. | `docs/API.md` Vendors; OpenAPI `GET /vendors` 200 | State: operation performed twice. A repeat of this read stays 200. |
| VLIST-05 | assumed — ask | `GET /vendors?active=false` | not specified | Not specified. Do not assert a status or body. Question: are query parameters ignored? (`docs/QUESTIONS.md` D.7). | OpenAPI `GET /vendors` documents no parameters; `docs/QUESTIONS.md` D.7 | Assumed — ask. |
| VLIST-06 | assumed — ask | `GET /vendors` after reset | 200 is documented; exact seed rows are stated only in `docs/API.md` | VLIST-01 already expects the `docs/API.md` seed table. Do not add names, flags, or an order from OpenAPI. Question: does reset restore the vendor names and active flags in A.7 exactly, given that OpenAPI does not list those rows? (`docs/QUESTIONS.md` D.38). | `docs/API.md` Seed data; OpenAPI reset description; `docs/QUESTIONS.md` D.38 and A.8.10 | Assumed — ask. |

These techniques do not apply: missing field, empty string, wrong type, negative number, and numeric boundaries, because this call has no body and no documented limits. Unknown id and a business-rule 400 do not apply: the operation has no id and no documented 400. Wrong workflow order does not apply.

## POST /vendors

| ID | type (positive / negative / error) | what we send | expected status | expected body (rule, key values) | source (API.md section or OpenAPI schema) | technique |
| --- | --- | --- | --- | --- | --- | --- |
| VND-01 | positive | `{ "name": "Cedar Point Hardware" }` | 201 | `Vendor`. `name` is `Cedar Point Hardware`. `active` is `true`. `id` is a string prefixed `vnd-`. | `docs/API.md` Vendors; OpenAPI `VendorCreate`, `Vendor` | Main success. Default for omitted `active`. |
| VND-02 | positive | `{ "name": "Cedar Point Hardware", "active": true }` | 201 | `name` is `Cedar Point Hardware`. `active` is `true`. `id` prefixed `vnd-`. | `docs/API.md` Vendors; OpenAPI `VendorCreate.active` | Documented option: `active` true. |
| VND-03 | positive | `{ "name": "Cedar Point Hardware", "active": false }` | 201 | `name` is `Cedar Point Hardware`. `active` is `false`. `id` prefixed `vnd-`. | `docs/API.md` Vendors; OpenAPI `VendorCreate.active` (boolean) | Documented option: `active` false. |
| VND-04 | positive | `{ "name": "A" }` | 201 | `name` is `A`. `active` is `true`. `id` prefixed `vnd-`. | OpenAPI `VendorCreate.name` `minLength` 1; `docs/API.md` Vendors | Boundary: smallest valid name (length 1). |
| VND-05 | negative | `{ "active": true }` | 400 | `detail` present. `rule` is `validation_error`. | OpenAPI `VendorCreate` required `name`; `POST /vendors` 400; `docs/API.md` Errors | Equivalence: missing field. |
| VND-06 | negative | `{ "name": "" }` | 400 | `detail` present. `rule` is `validation_error`. | `docs/API.md` Vendors (name cannot be empty); OpenAPI `VendorCreate.name` `minLength` 1; `POST /vendors` 400 | Equivalence: empty string. Boundary: length 0, one under the minimum. |
| VND-07 | negative | `{ "name": 1 }` | 400 | `detail` present. `rule` is `validation_error`. | OpenAPI `VendorCreate.name` (string); `POST /vendors` 400 | Equivalence: wrong type. |
| VND-08 | negative | `{ "name": "Cedar Point Hardware", "active": "true" }` | 400 | `detail` present. `rule` is `validation_error`. | OpenAPI `VendorCreate.active` (boolean); `POST /vendors` 400 | Equivalence: wrong type. |
| VND-09 | negative | JSON array `[]` | 400 | `detail` present. `rule` is `validation_error`. | OpenAPI `POST /vendors` body `VendorCreate` (object); `POST /vendors` 400 | Equivalence: wrong type. |
| VND-10 | assumed — ask | `{ "name": " " }` | not specified | Not specified. Do not assert a status or body. Question: is a name of only spaces rejected? `minLength` 1 allows a single space (`docs/QUESTIONS.md` D.4). | OpenAPI `VendorCreate.name` `minLength` 1 does not forbid spaces; `docs/QUESTIONS.md` D.4 | Assumed — ask. |
| VND-11 | assumed — ask | `{ "name": " Cedar " }` | not specified | Not specified. Do not assert whether `name` is stored trimmed. Question: is `name` trimmed? (`docs/QUESTIONS.md` D.4). | `docs/QUESTIONS.md` D.4 | Assumed — ask. |
| VND-12 | assumed — ask | Two creates with the same `name` and `active` true | not specified | Not specified. Do not assert the second response. Question: must vendor names be unique? (`docs/QUESTIONS.md` D.4). | `docs/QUESTIONS.md` D.4 | Assumed — ask. State: same create twice. |
| VND-13 | assumed — ask | `{ "name": "Cedar Point Hardware", "extra": true }` | not specified | Not specified. Do not assert rejection or stripping. Question: are additional JSON properties rejected? (`docs/QUESTIONS.md` D.5). | `docs/QUESTIONS.md` D.5 | Assumed — ask. |
| VND-14 | assumed — ask | Valid `{ "name": "Cedar Point Hardware" }` with no `Content-Type`, and the same fields as text that is not JSON | not specified | Not specified. Do not assert a status. Question: what is returned when `Content-Type: application/json` is missing or the body is not JSON? (`docs/QUESTIONS.md` D.6). | `docs/API.md` Basics requires the header and gives no status; `docs/QUESTIONS.md` D.6 | Assumed — ask. |
| VND-15 | assumed — ask | Any body that VND-01 accepts | 201 is documented; the id pattern is not | Assert only the `vnd-` prefix. Do not assert the rest of `id`. Question: what is the exact format of server-created `vnd-` ids beyond the prefix? (`docs/QUESTIONS.md` D.1). | `docs/API.md` Basics; OpenAPI `Vendor.id` (string); `docs/QUESTIONS.md` D.1 | Assumed — ask. |

These techniques do not apply: a documented maximum on `name`, a negative number, one unit more than ordered, one cent more than received, unknown id, a business-rule 400, and wrong workflow order. Length 0 is VND-06. The only documented 400 is `validation_error` (VND-05 through VND-09).

## GET /skus

No request options or defaults are documented. There is no documented way to create or change a SKU.

| ID | type (positive / negative / error) | what we send | expected status | expected body (rule, key values) | source (API.md section or OpenAPI schema) | technique |
| --- | --- | --- | --- | --- | --- | --- |
| SKU-01 | positive | `GET /skus` after reset | 200 | Array of `Sku`. Contains these five rows and no others. Order is not asserted. `LUM-2X4-8` / `2x4 stud, 8 ft` / 4.75. `PLY-12-4X8` / `Plywood sheet, 1/2 in, 4x8 ft` / 22.40. `CEM-30KG` / `Cement bag, 30 kg` / 11.90. `REB-10MM-6` / `Rebar, 10 mm, 6 m` / 18.25. `SCR-DECK-1LB` / `Deck screws, 1 lb box` / 9.99. Do not assert 47.5. | `docs/API.md` Seed data (after a start or a reset, those five SKU rows) and Catalog (lists the five SKUs with their catalog prices); OpenAPI `GET /skus` 200, schema `Sku`. The OpenAPI example price 47.5 is not the catalog price. | Main success. |
| SKU-02 | positive | `GET /skus` twice, with no write between the calls | 200 | Both responses contain the same five `sku` values. | `docs/API.md` Catalog; OpenAPI `GET /skus` 200 | State: operation performed twice. A repeat of this read stays 200. |
| SKU-03 | positive | `POST /vendors` with `{ "name": "Cedar Point Hardware" }`, then `GET /skus` | 200 | The same five seed SKUs as SKU-01. | `docs/API.md` Catalog (the list is the five SKUs); OpenAPI has no other catalog operation | State: catalog is unchanged by vendor create. |
| SKU-04 | assumed — ask | `GET /skus?sku=LUM-2X4-8` | not specified | Not specified. Do not assert a status or body. Question: are query parameters ignored? (`docs/QUESTIONS.md` D.7). | OpenAPI `GET /skus` documents no parameters; `docs/QUESTIONS.md` D.7 | Assumed — ask. |
| SKU-05 | assumed — ask | `GET /skus` after reset | 200 is documented; exact catalog rows are stated only in `docs/API.md` | SKU-01 already expects the `docs/API.md` seed prices. Do not assert the OpenAPI example `unit_price` 47.5. Question: does reset restore the SKU descriptions and catalog prices in A.7 exactly, given that OpenAPI does not list those rows? (`docs/QUESTIONS.md` D.38). | `docs/API.md` Seed data; OpenAPI `Sku.unit_price` example 47.5; `docs/QUESTIONS.md` D.38, A.7, and A.8.2 | Assumed — ask. |

These techniques do not apply: missing field, empty string, wrong type, negative number, and numeric boundaries, because this call has no body and the catalog prices are seed data, not request limits. Unknown id and a business-rule 400 do not apply. Wrong workflow order does not apply. Questions about whether a purchase-order SKU must exist in this catalog (`docs/QUESTIONS.md` D.11 and D.12) belong to purchase-order create, not to `GET /skus`.
