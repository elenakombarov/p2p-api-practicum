---
name: api-schema-validation
description: Checks that API responses match the shapes in /openapi.json, through one helper, expectSchema. Use when writing or reviewing an API test, when the user asks to validate a response, check a schema, a contract, field types or required fields, or when a response has a field nobody expected. Do NOT use to decide which cases to test — that is api-test-design.
paths: "tests/**"
---

# API schema validation

`GET /openapi.json` is the source of response shapes. `expectSchema` checks one response body against one named schema from that document.

## 1. Find the exact schema name

Find the exact schema name in `GET /openapi.json`. Follow `paths` → the operation → `responses` → the status → `content` → `application/json` → `schema` → `$ref`.

A `$ref` of `#/components/schemas/Vendor` means the schema name is `Vendor`.

Never guess schema names. Rejected requests use `Error` when that response documents `Error`.

## 2. Call expectSchema

Call `expectSchema(request, body, name)` for response bodies in API tests, including success and error responses where a schema is documented.

```typescript
expect(response.status()).toBe(200);
const body: unknown = await response.json();
if (Array.isArray(body)) {
  for (const vendor of body) {
    await expectSchema(request, vendor, 'Vendor');
  }
}
```

## 3. Shape is not behavior

Schema validation checks response shape, not business behavior. Continue asserting relevant status codes, amounts, flags, rules, and values.

## 4. When schema validation fails

When schema validation fails, show the Ajv errors. Ask the human whether the API or the documentation is incorrect.

## 5. Do not weaken the contract

Never edit OpenAPI schemas or weaken validation merely to make a test pass.

## 6. Scope

This skill handles schema validation only. Test-case selection belongs to api-test-design.
