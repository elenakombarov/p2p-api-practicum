# POST /vendors

Design only. No test code until this table is approved.

Scope is `POST /vendors`. `GET /vendors` and `GET /vendors/{vendorId}/exposure` are not in this table.

Setup for every row: `Content-Type: application/json` and a JSON body, except VND-14. `POST /admin/reset` before a run so created vendors do not leak between cases (`docs/API.md` System).

Documented contract:

- 201 and a `Vendor`: `id`, `name`, `active` (`docs/API.md` Vendors; OpenAPI `POST /vendors` 201, schema `Vendor`).
- `name` is required, string, `minLength` 1. `active` is optional and defaults to `true` (`docs/API.md` Vendors; OpenAPI `VendorCreate`).
- Server-created ids use the prefix `vnd-` (`docs/API.md` Basics). The pattern after that prefix is open (`docs/QUESTIONS.md` D.1).
- Invalid body is 400 with `rule` `validation_error` (OpenAPI `POST /vendors` 400; `docs/API.md` Errors). `detail` is present. Its exact text is not asserted (`docs/QUESTIONS.md` D.10).
- None of the 11 business rules reject this call. `inactive_vendor_gate` applies to purchase-order create, so `active: false` is a valid create. This operation has no id parameter, so there is no 404 case.

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

## Techniques not used

- Boundary 0, exactly at a maximum, and one over a maximum: `name` has no documented maximum. Length 0 is VND-06. There is no numeric field, so a negative number does not apply.
- One unit more than ordered, and one cent more than received: no quantity or money on this request.
- Unknown id, 404: this operation does not take an id. 404 is not a documented response.
- Business-rule 400: no rule from the list of 11 is documented on `POST /vendors`. The only documented 400 is `validation_error` (VND-05 through VND-09).
- Wrong workflow order: create has no prior step.
