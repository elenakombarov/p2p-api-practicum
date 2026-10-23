import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { expectSchema } from './helpers/schema';

const apiTag = { tag: '@api' };

interface ExpectedLine {
  sku: string;
  description: string;
  quantity: number;
  unit_price: number;
}

interface PoLineCore {
  sku: string;
  description: string;
  quantity: number;
  unit_price: number;
}

interface PurchaseOrderCore {
  id: string;
  vendor_id: string;
  status: string;
  line_items: PoLineCore[];
}

interface VendorBody {
  id: string;
}

interface OneLineOverrides {
  sku?: string | number;
  description?: string | number;
  quantity?: string | number;
  unit_price?: string | number;
}

const workedExample = {
  vendor_id: 'vnd-001',
  line_items: [
    { sku: 'LUM-2X4-8', description: '2x4 stud, 8 ft', quantity: 10, unit_price: 4.75 },
    { sku: 'CEM-30KG', quantity: 4, unit_price: 11.9 },
  ],
};

const workedExampleLines: ExpectedLine[] = [
  { sku: 'LUM-2X4-8', description: '2x4 stud, 8 ft', quantity: 10, unit_price: 4.75 },
  { sku: 'CEM-30KG', description: '', quantity: 4, unit_price: 11.9 },
];

const oneLineExpected: ExpectedLine = {
  sku: 'LUM-2X4-8',
  description: '',
  quantity: 10,
  unit_price: 4.75,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPoLineCore(value: unknown): value is PoLineCore {
  return (
    isRecord(value) &&
    typeof value.sku === 'string' &&
    typeof value.description === 'string' &&
    typeof value.quantity === 'number' &&
    typeof value.unit_price === 'number'
  );
}

function isPurchaseOrderCore(value: unknown): value is PurchaseOrderCore {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.vendor_id === 'string' &&
    typeof value.status === 'string' &&
    Array.isArray(value.line_items) &&
    value.line_items.every(isPoLineCore)
  );
}

function isErrorBody(value: unknown): value is { detail: string } & Record<string, unknown> {
  return isRecord(value) && typeof value.detail === 'string';
}

function isVendorBody(value: unknown): value is VendorBody {
  return isRecord(value) && typeof value.id === 'string';
}

function oneLineBody(line: OneLineOverrides = {}, vendorId: string | number = 'vnd-001') {
  const item: Record<string, string | number> = {
    sku: line.sku ?? 'LUM-2X4-8',
    quantity: line.quantity ?? 10,
    unit_price: line.unit_price ?? 4.75,
  };
  if (line.description !== undefined) {
    item.description = line.description;
  }
  return {
    vendor_id: vendorId,
    line_items: [item],
  };
}

function postPurchaseOrder(request: APIRequestContext, data: object): Promise<APIResponse> {
  return request.post('/purchase-orders', {
    headers: { 'Content-Type': 'application/json' },
    data,
  });
}

function expectLines(actual: PoLineCore[], expected: ExpectedLine[]): void {
  expect(actual).toHaveLength(expected.length);
  for (const line of expected) {
    const match = actual.find((item) => item.sku === line.sku);
    expect(match).toEqual(
      expect.objectContaining({
        sku: line.sku,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
      }),
    );
  }
}

async function expectPurchaseOrder(
  request: APIRequestContext,
  response: APIResponse,
  status: number,
): Promise<PurchaseOrderCore> {
  expect(response.status()).toBe(status);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'PurchaseOrder');
  if (!isPurchaseOrderCore(body)) {
    throw new Error('response did not match PurchaseOrder');
  }
  return body;
}

async function createDraft(
  request: APIRequestContext,
  data: object,
  lines: ExpectedLine[],
  vendorId = 'vnd-001',
): Promise<PurchaseOrderCore> {
  const response = await postPurchaseOrder(request, data);
  const po = await expectPurchaseOrder(request, response, 201);
  expect(po.id.startsWith('po-')).toBe(true);
  expect(po.vendor_id).toBe(vendorId);
  expect(po.status).toBe('draft');
  expectLines(po.line_items, lines);
  return po;
}

function expectReceivedQuantity(raw: Record<string, unknown>, sku: string, received: number): void {
  const lineItems = raw.line_items;
  if (!Array.isArray(lineItems)) {
    throw new Error('line_items was not an array');
  }
  const line = lineItems.find((item) => isRecord(item) && item.sku === sku);
  if (!isRecord(line)) {
    throw new Error(`missing line ${sku}`);
  }
  expect(line.received_quantity).toBe(received);
}

function expectWorkedExample(po: PurchaseOrderCore, expectedId?: string): void {
  expect(po.id.startsWith('po-')).toBe(true);
  if (expectedId !== undefined) {
    expect(po.id).toBe(expectedId);
  }
  expect(po.vendor_id).toBe('vnd-001');
  expect(po.status).toBe('draft');
  expectLines(po.line_items, workedExampleLines);

  const raw = Object.fromEntries(Object.entries(po));
  expect(raw.ordered_value).toBe(95.1);
  expect(raw.received_value).toBe(0);
  expect(raw.fully_received).toBe(false);
  expectReceivedQuantity(raw, 'LUM-2X4-8', 0);
  expectReceivedQuantity(raw, 'CEM-30KG', 0);
}

async function expectErrorRule(
  request: APIRequestContext,
  response: APIResponse,
  status: number,
  rule: string,
): Promise<void> {
  expect(response.status()).toBe(status);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
  if (!isErrorBody(body)) {
    throw new Error('error response did not include detail');
  }
  expect(Object.prototype.hasOwnProperty.call(body, 'detail')).toBe(true);
  expect(body.rule).toBe(rule);
}

function expectValidationError(request: APIRequestContext, response: APIResponse): Promise<void> {
  return expectErrorRule(request, response, 400, 'validation_error');
}

async function expectRuleAbsent(request: APIRequestContext, response: APIResponse): Promise<void> {
  expect(response.status()).toBe(404);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
  if (!isErrorBody(body)) {
    throw new Error('404 response did not include detail');
  }
  expect(Object.prototype.hasOwnProperty.call(body, 'detail')).toBe(true);
  expect(Object.prototype.hasOwnProperty.call(body, 'rule')).toBe(false);
}

test.describe('purchase orders', () => {
  test('POC-01 creates the worked example as a draft', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, workedExample);
    const po = await expectPurchaseOrder(request, response, 201);
    expectWorkedExample(po);
  });

  test('POC-02 creates a one-line draft', apiTag, async ({ request }) => {
    await createDraft(request, oneLineBody(), [oneLineExpected]);
  });

  test('POC-03 stores an empty description', apiTag, async ({ request }) => {
    await createDraft(request, oneLineBody({ description: '' }), [oneLineExpected]);
  });

  test('POC-04 stores the unit price sent on the line', apiTag, async ({ request }) => {
    await createDraft(
      request,
      {
        vendor_id: 'vnd-001',
        line_items: [{ sku: 'LUM-2X4-8', quantity: 1, unit_price: 6.25 }],
      },
      [{ sku: 'LUM-2X4-8', description: '', quantity: 1, unit_price: 6.25 }],
    );
  });

  test('POC-05 accepts the smallest valid quantity', apiTag, async ({ request }) => {
    await createDraft(request, oneLineBody({ quantity: 1 }), [
      { sku: 'LUM-2X4-8', description: '', quantity: 1, unit_price: 4.75 },
    ]);
  });

  test('POC-06 accepts the maximum quantity', apiTag, async ({ request }) => {
    await createDraft(request, oneLineBody({ quantity: 10000 }), [
      { sku: 'LUM-2X4-8', description: '', quantity: 10000, unit_price: 4.75 },
    ]);
  });

  test('POC-07 accepts a zero unit price', apiTag, async ({ request }) => {
    await createDraft(request, oneLineBody({ quantity: 1, unit_price: 0 }), [
      { sku: 'LUM-2X4-8', description: '', quantity: 1, unit_price: 0 },
    ]);
  });

  test('POC-08 accepts the maximum unit price', apiTag, async ({ request }) => {
    await createDraft(request, oneLineBody({ quantity: 1, unit_price: 100000 }), [
      { sku: 'LUM-2X4-8', description: '', quantity: 1, unit_price: 100000 },
    ]);
  });

  test('POC-09 creates a draft for a new active vendor', apiTag, async ({ request }) => {
    const name = `POC-09 ${Date.now()} ${Math.random().toString(16).slice(2)}`;
    const vendorResponse = await request.post('/vendors', { data: { name } });
    expect(vendorResponse.status()).toBe(201);
    const vendorBody: unknown = await vendorResponse.json();
    await expectSchema(request, vendorBody, 'Vendor');
    if (!isVendorBody(vendorBody)) {
      throw new Error('POST /vendors did not return a Vendor');
    }

    await createDraft(request, oneLineBody({}, vendorBody.id), [oneLineExpected], vendorBody.id);
  });

  test('POC-10 creates a second draft with a different id', apiTag, async ({ request }) => {
    const first = await createDraft(request, oneLineBody(), [oneLineExpected]);
    const second = await createDraft(request, oneLineBody(), [oneLineExpected]);

    expect(first.id).not.toBe(second.id);
    expect(first.id.startsWith('po-')).toBe(true);
    expect(second.id.startsWith('po-')).toBe(true);
  });

  test('POC-11 rejects a body with no vendor_id', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, {
      line_items: [{ sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 }],
    });
    await expectValidationError(request, response);
  });

  test('POC-12 rejects a body with no line_items', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, { vendor_id: 'vnd-001' });
    await expectValidationError(request, response);
  });

  test('POC-13 rejects a line with no sku', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, {
      vendor_id: 'vnd-001',
      line_items: [{ quantity: 10, unit_price: 4.75 }],
    });
    await expectValidationError(request, response);
  });

  test('POC-14 rejects a line with no quantity', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, {
      vendor_id: 'vnd-001',
      line_items: [{ sku: 'LUM-2X4-8', unit_price: 4.75 }],
    });
    await expectValidationError(request, response);
  });

  test('POC-15 rejects a line with no unit_price', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, {
      vendor_id: 'vnd-001',
      line_items: [{ sku: 'LUM-2X4-8', quantity: 10 }],
    });
    await expectValidationError(request, response);
  });

  test('POC-16 rejects an empty sku', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, oneLineBody({ sku: '' }));
    await expectValidationError(request, response);
  });

  test('POC-17 rejects a quantity of zero', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, oneLineBody({ quantity: 0 }));
    await expectValidationError(request, response);
  });

  test('POC-18 rejects a negative quantity', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, oneLineBody({ quantity: -1 }));
    await expectValidationError(request, response);
  });

  test('POC-19 rejects a quantity above 10000', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, oneLineBody({ quantity: 10001 }));
    await expectValidationError(request, response);
  });

  test('POC-20 rejects a negative unit price', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, oneLineBody({ quantity: 1, unit_price: -1 }));
    await expectValidationError(request, response);
  });

  test('POC-21 rejects a unit price above 100000', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, oneLineBody({ quantity: 1, unit_price: 100001 }));
    await expectValidationError(request, response);
  });

  test('POC-22 rejects a non-string vendor_id', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, oneLineBody({}, 1));
    await expectValidationError(request, response);
  });

  test('POC-23 rejects line_items that is not an array', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, {
      vendor_id: 'vnd-001',
      line_items: { sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 },
    });
    await expectValidationError(request, response);
  });

  test('POC-24 rejects a line that is not an object', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, {
      vendor_id: 'vnd-001',
      line_items: ['LUM-2X4-8'],
    });
    await expectValidationError(request, response);
  });

  test('POC-25 rejects a non-string sku', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, oneLineBody({ sku: 1 }));
    await expectValidationError(request, response);
  });

  test('POC-26 rejects a non-number quantity', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, oneLineBody({ quantity: '10' }));
    await expectValidationError(request, response);
  });

  test('POC-27 rejects a non-number unit price', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, oneLineBody({ unit_price: '4.75' }));
    await expectValidationError(request, response);
  });

  test('POC-28 rejects a non-string description', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, oneLineBody({ description: 1 }));
    await expectValidationError(request, response);
  });

  test('POC-29 rejects an array body', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, []);
    await expectValidationError(request, response);
  });

  test('POC-30 returns 404 for an unknown vendor', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, oneLineBody({}, 'vnd-999'));
    await expectRuleAbsent(request, response);
  });

  test('POC-31 rejects an inactive vendor', apiTag, async ({ request }) => {
    const response = await postPurchaseOrder(request, oneLineBody({}, 'vnd-002'));
    await expectErrorRule(request, response, 400, 'inactive_vendor_gate');
  });

  test('POGET-01 reads the worked example draft', apiTag, async ({ request }) => {
    const createdResponse = await postPurchaseOrder(request, workedExample);
    const created = await expectPurchaseOrder(request, createdResponse, 201);

    const response = await request.get(`/purchase-orders/${created.id}`);
    const po = await expectPurchaseOrder(request, response, 200);
    expectWorkedExample(po, created.id);
  });

  test('POGET-02 reads a submitted purchase order', apiTag, async ({ request }) => {
    const created = await createDraft(request, workedExample, workedExampleLines);
    const submittedResponse = await request.post(`/purchase-orders/${created.id}/submit`);
    const submitted = await expectPurchaseOrder(request, submittedResponse, 200);
    expect(submitted.status).toBe('submitted');

    const response = await request.get(`/purchase-orders/${created.id}`);
    const po = await expectPurchaseOrder(request, response, 200);
    expect(po.status).toBe('submitted');
    expect(po.id).toBe(created.id);
    expect(po.vendor_id).toBe('vnd-001');
  });

  test('POGET-03 reads a closed purchase order', apiTag, async ({ request }) => {
    const created = await createDraft(request, oneLineBody(), [oneLineExpected]);
    const submittedResponse = await request.post(`/purchase-orders/${created.id}/submit`);
    await expectPurchaseOrder(request, submittedResponse, 200);
    const receivedResponse = await request.post(`/purchase-orders/${created.id}/receive`, {
      data: { items: [{ sku: 'LUM-2X4-8', quantity: 10 }] },
    });
    await expectPurchaseOrder(request, receivedResponse, 200);

    const response = await request.get(`/purchase-orders/${created.id}`);
    const po = await expectPurchaseOrder(request, response, 200);
    expect(po.status).toBe('closed');
    expect(po.id).toBe(created.id);
    expect(po.vendor_id).toBe('vnd-001');
    expect(po.line_items).toEqual([
      expect.objectContaining({
        sku: 'LUM-2X4-8',
        quantity: 10,
      }),
    ]);
  });

  test('POGET-04 returns the same purchase order on a repeated read', apiTag, async ({ request }) => {
    const created = await createDraft(request, oneLineBody(), [oneLineExpected]);

    const firstResponse = await request.get(`/purchase-orders/${created.id}`);
    const secondResponse = await request.get(`/purchase-orders/${created.id}`);
    const first = await expectPurchaseOrder(request, firstResponse, 200);
    const second = await expectPurchaseOrder(request, secondResponse, 200);

    expect(first.id).toBe(created.id);
    expect(second.id).toBe(created.id);
    expect(first.status).toBe(second.status);
    expect(first.line_items).toHaveLength(1);
    expect(second.line_items).toHaveLength(1);
    expect(first.line_items[0].sku).toBe(second.line_items[0].sku);
    expect(first.line_items[0].quantity).toBe(second.line_items[0].quantity);
    expect(first.line_items[0].unit_price).toBe(second.line_items[0].unit_price);
    expect(first.line_items[0].sku).toBe('LUM-2X4-8');
    expect(first.line_items[0].quantity).toBe(10);
    expect(first.line_items[0].unit_price).toBe(4.75);
  });

  test('POGET-05 returns 404 for an unknown purchase order', apiTag, async ({ request }) => {
    const response = await request.get('/purchase-orders/po-does-not-exist');
    await expectRuleAbsent(request, response);
  });

  test('SUBMIT-01 submits a draft', apiTag, async ({ request }) => {
    const created = await createDraft(request, workedExample, workedExampleLines);

    const response = await request.post(`/purchase-orders/${created.id}/submit`);
    const po = await expectPurchaseOrder(request, response, 200);
    expect(po.status).toBe('submitted');
    expect(po.id).toBe(created.id);
    expect(po.vendor_id).toBe('vnd-001');
  });

  test('SUBMIT-02 rejects a second submit', apiTag, async ({ request }) => {
    const created = await createDraft(request, oneLineBody(), [oneLineExpected]);
    const firstResponse = await request.post(`/purchase-orders/${created.id}/submit`);
    const first = await expectPurchaseOrder(request, firstResponse, 200);
    expect(first.status).toBe('submitted');

    const secondResponse = await request.post(`/purchase-orders/${created.id}/submit`);
    await expectErrorRule(request, secondResponse, 400, 'workflow_gate');
  });

  test('SUBMIT-03 rejects submit of a closed purchase order', apiTag, async ({ request }) => {
    const created = await createDraft(request, oneLineBody(), [oneLineExpected]);
    const submittedResponse = await request.post(`/purchase-orders/${created.id}/submit`);
    await expectPurchaseOrder(request, submittedResponse, 200);
    const receivedResponse = await request.post(`/purchase-orders/${created.id}/receive`, {
      data: { items: [{ sku: 'LUM-2X4-8', quantity: 10 }] },
    });
    await expectPurchaseOrder(request, receivedResponse, 200);

    const fetchedResponse = await request.get(`/purchase-orders/${created.id}`);
    const fetched = await expectPurchaseOrder(request, fetchedResponse, 200);
    expect(fetched.status).toBe('closed');

    const response = await request.post(`/purchase-orders/${created.id}/submit`);
    await expectErrorRule(request, response, 400, 'workflow_gate');
  });

  test('SUBMIT-04 returns 404 for an unknown purchase order', apiTag, async ({ request }) => {
    const response = await request.post('/purchase-orders/po-does-not-exist/submit');
    await expectRuleAbsent(request, response);
  });
});
