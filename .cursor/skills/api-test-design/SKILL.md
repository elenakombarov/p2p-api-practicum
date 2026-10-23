---
name: api-test-design
description: Designs API test cases as a table a human approves, from docs/API.md and /openapi.json, before any test code exists. Use when the user asks what to test for an endpoint or an area of the API, asks for test cases, test ideas, a test plan or coverage, or names an endpoint they want covered. Writes docs/test-design/<area>.md and stops for approval. Do NOT use to write test code — that is the api-test-writer subagent.
paths: "docs/**, tests/**"
---

# API test design

This skill designs test cases only. The api-test-writer subagent implements approved tests later.

## 1. Read the relevant endpoints

Read the relevant endpoints in:

- `docs/API.md`
- `/openapi.json`
- `docs/QUESTIONS.md`

## 2. Create the design document

Create `docs/test-design/<area>.md`.

Use one table per endpoint.

Required columns:

| ID | type (positive / negative / error) | what we send | expected status | expected body (rule, key values) | source (API.md section or OpenAPI schema) | technique |
| --- | --- | --- | --- | --- | --- | --- |

## 3. Include positive coverage

- Main success case.
- One row for each documented option or default.

## 4. Include negative coverage

Explicitly name the testing technique.

Apply techniques only where relevant to the endpoint and documented behavior. Do not invent unsupported requirements.

Boundary values:

- 0
- Smallest valid value
- Exactly at a limit
- One over the limit
- One unit more than ordered
- One cent more than received

Equivalence classes:

- Missing field
- Empty string
- Wrong type
- Negative number

State:

- Operation performed in the wrong order
- Operation performed twice

## 5. Include error coverage

- Unknown ID: 404, without a rule.
- Every documented business rule affecting the endpoint: at least one attempt to violate it, expecting HTTP 400 and the documented rule.

Apply unknown-ID coverage where the endpoint accepts or references an ID.

## 6. Undocumented behavior

- Add a row marked "assumed — ask".
- Include the relevant question from `docs/QUESTIONS.md`.
- Do not invent an expected result.

## 7. Stop for approval

STOP after writing the design document.

Show the test-case table to the human.

Ask for explicit approval: "Please review the test design. Reply 'approved' or request changes."

Do not write test code. Do not create or modify `.spec.ts` files.
