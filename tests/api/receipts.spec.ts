import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { expectSchema } from './helpers/schema';

const apiTag = { tag: '@api' };

interface OrderedLine {
  sku: string;
  quantity: number;
}

interface PoLineCore {
  sku: string;
  quantity: number;
}

interface PurchaseOrderCore {
  id: string;
  vendor_id: string;
  status: string;
  line_items: PoLineCore[];
}

const workedExample = {
  vendor_id: 'vnd-001',
  line_items: [
    { sku: 'LUM-2X4-8', description: '2x4 stud, 8 ft', quantity: 10, unit_price: 4.75 },
    { sku: 'CEM-30KG', quantity: 4, unit_price: 11.9 },
  ],
};

const curlReceipt = {
  items: [{ sku: 'LUM-2X4-8', quantity: 10 }],
};

const lumberLine: OrderedLine = { sku: 'LUM-2X4-8', quantity: 10 };
const cementLine: OrderedLine = { sku: 'CEM-30KG', quantity: 4 };

function oneLineBody(quantity = 10) {
  return {
    vendor_id: 'vnd-001',
    line_items: [{ sku: 'LUM-2X4-8', quantity, unit_price: 4.75 }],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPoLineCore(value: unknown): value is PoLineCore {
  return isRecord(value) && typeof value.sku === 'string' && typeof value.quantity === 'number';
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

function postJson(request: APIRequestContext, path: string, data: object): Promise<APIResponse> {
  return request.post(path, {
    headers: { 'Content-Type': 'application/json' },
    data,
  });
}

function postReceive(request: APIRequestContext, poId: string, data: object): Promise<APIResponse> {
  return postJson(request, `/purchase-orders/${poId}/receive`, data);
}

async function readPurchaseOrder(
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

function expectOrderedLines(po: PurchaseOrderCore, lines: OrderedLine[]): void {
  for (const line of lines) {
    const match = po.line_items.find((item) => item.sku === line.sku);
    expect(match).toEqual(expect.objectContaining({ sku: line.sku, quantity: line.quantity }));
  }
}

async function createPurchaseOrder(request: APIRequestContext, data: object): Promise<string> {
  const response = await postJson(request, '/purchase-orders', data);
  const po = await readPurchaseOrder(request, response, 201);
  return po.id;
}

async function submitPurchaseOrder(request: APIRequestContext, poId: string): Promise<void> {
  const response = await request.post(`/purchase-orders/${poId}/submit`);
  const po = await readPurchaseOrder(request, response, 200);
  expect(po.id).toBe(poId);
  expect(po.status).toBe('submitted');
}

async function createSubmittedPurchaseOrder(request: APIRequestContext, data: object): Promise<string> {
  const poId = await createPurchaseOrder(request, data);
  await submitPurchaseOrder(request, poId);
  return poId;
}

async function expectReceiptIdentity(
  request: APIRequestContext,
  response: APIResponse,
  poId: string,
  lines: OrderedLine[],
): Promise<PurchaseOrderCore> {
  const po = await readPurchaseOrder(request, response, 200);
  expect(po.id).toBe(poId);
  expect(po.vendor_id).toBe('vnd-001');
  expectOrderedLines(po, lines);
  return po;
}

async function expectSubmittedReceipt(
  request: APIRequestContext,
  response: APIResponse,
  poId: string,
  lines: OrderedLine[],
): Promise<void> {
  const po = await expectReceiptIdentity(request, response, poId, lines);
  expect(po.status).toBe('submitted');
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

test.describe('receipts', () => {
  test('RCV-01 receives the curl receipt on a submitted one-line purchase order', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());
    const response = await postReceive(request, poId, curlReceipt);
    await expectReceiptIdentity(request, response, poId, [lumberLine]);
  });

  test('RCV-02 receives every ordered line in one delivery', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, workedExample);
    const response = await postReceive(request, poId, {
      items: [
        { sku: 'LUM-2X4-8', quantity: 10 },
        { sku: 'CEM-30KG', quantity: 4 },
      ],
    });
    await expectReceiptIdentity(request, response, poId, [lumberLine, cementLine]);
  });

  test('RCV-03 receives one line of a two-line purchase order', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, workedExample);
    const response = await postReceive(request, poId, curlReceipt);
    await expectSubmittedReceipt(request, response, poId, [lumberLine, cementLine]);
  });

  test('RCV-04 receives the smallest valid delivery quantity', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());
    const response = await postReceive(request, poId, {
      items: [{ sku: 'LUM-2X4-8', quantity: 1 }],
    });
    await expectSubmittedReceipt(request, response, poId, [lumberLine]);
  });

  test('RCV-05 receives one under the ordered quantity', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());
    const response = await postReceive(request, poId, {
      items: [{ sku: 'LUM-2X4-8', quantity: 9 }],
    });
    await expectSubmittedReceipt(request, response, poId, [lumberLine]);
  });

  test('RCV-06 receives a delivery at the quantity limit', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody(10000));
    const response = await postReceive(request, poId, {
      items: [{ sku: 'LUM-2X4-8', quantity: 10000 }],
    });
    await expectReceiptIdentity(request, response, poId, [{ sku: 'LUM-2X4-8', quantity: 10000 }]);
  });

  test('RCV-07 receives two partial deliveries under the ordered quantity', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());
    const payload = { items: [{ sku: 'LUM-2X4-8', quantity: 3 }] };

    const first = await postReceive(request, poId, payload);
    await expectSubmittedReceipt(request, first, poId, [lumberLine]);

    const second = await postReceive(request, poId, payload);
    await expectSubmittedReceipt(request, second, poId, [lumberLine]);
  });

  test('RCV-08 receives deliveries that add up to the ordered quantity', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());

    const firstResponse = await postReceive(request, poId, {
      items: [{ sku: 'LUM-2X4-8', quantity: 4 }],
    });
    const first = await readPurchaseOrder(request, firstResponse, 200);
    expect(first.id).toBe(poId);
    expect(first.status).toBe('submitted');

    const secondResponse = await postReceive(request, poId, {
      items: [{ sku: 'LUM-2X4-8', quantity: 6 }],
    });
    await expectReceiptIdentity(request, secondResponse, poId, [lumberLine]);
  });

  test('RCV-09 receives each ordered line in its own delivery', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, workedExample);

    const firstResponse = await postReceive(request, poId, curlReceipt);
    const first = await readPurchaseOrder(request, firstResponse, 200);
    expect(first.id).toBe(poId);
    expect(first.status).toBe('submitted');
    expectOrderedLines(first, [lumberLine, cementLine]);

    const secondResponse = await postReceive(request, poId, {
      items: [{ sku: 'CEM-30KG', quantity: 4 }],
    });
    await expectReceiptIdentity(request, secondResponse, poId, [lumberLine, cementLine]);
  });

  test('RCV-10 rejects a receive body with no items', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());
    const response = await postReceive(request, poId, {});
    await expectErrorRule(request, response, 400, 'validation_error');
  });

  test('RCV-11 rejects a delivery item with no sku', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());
    const response = await postReceive(request, poId, {
      items: [{ quantity: 10 }],
    });
    await expectErrorRule(request, response, 400, 'validation_error');
  });

  test('RCV-12 rejects a delivery item with no quantity', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());
    const response = await postReceive(request, poId, {
      items: [{ sku: 'LUM-2X4-8' }],
    });
    await expectErrorRule(request, response, 400, 'validation_error');
  });

  test('RCV-13 rejects an empty delivery sku', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());
    const response = await postReceive(request, poId, {
      items: [{ sku: '', quantity: 10 }],
    });
    await expectErrorRule(request, response, 400, 'validation_error');
  });

  test('RCV-14 rejects a delivery quantity of zero', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());
    const response = await postReceive(request, poId, {
      items: [{ sku: 'LUM-2X4-8', quantity: 0 }],
    });
    await expectErrorRule(request, response, 400, 'validation_error');
  });

  test('RCV-15 rejects a negative delivery quantity', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());
    const response = await postReceive(request, poId, {
      items: [{ sku: 'LUM-2X4-8', quantity: -1 }],
    });
    await expectErrorRule(request, response, 400, 'validation_error');
  });

  test('RCV-16 rejects a non-string delivery sku', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());
    const response = await postReceive(request, poId, {
      items: [{ sku: 1, quantity: 10 }],
    });
    await expectErrorRule(request, response, 400, 'validation_error');
  });

  test('RCV-17 rejects a non-number delivery quantity', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());
    const response = await postReceive(request, poId, {
      items: [{ sku: 'LUM-2X4-8', quantity: '10' }],
    });
    await expectErrorRule(request, response, 400, 'validation_error');
  });

  test('RCV-18 rejects items that is not an array', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());
    const response = await postReceive(request, poId, {
      items: { sku: 'LUM-2X4-8', quantity: 10 },
    });
    await expectErrorRule(request, response, 400, 'validation_error');
  });

  test('RCV-19 rejects a delivery item that is not an object', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());
    const response = await postReceive(request, poId, {
      items: ['LUM-2X4-8'],
    });
    await expectErrorRule(request, response, 400, 'validation_error');
  });

  test('RCV-20 rejects an array receive body', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());
    const response = await postReceive(request, poId, []);
    await expectErrorRule(request, response, 400, 'validation_error');
  });

  test('RCV-21 rejects a delivery one over the ordered quantity', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());
    const response = await postReceive(request, poId, {
      items: [{ sku: 'LUM-2X4-8', quantity: 11 }],
    });
    await expectErrorRule(request, response, 400, 'receive_quantity_limit');
  });

  test('RCV-22 rejects a later delivery that exceeds the ordered quantity', apiTag, async ({ request }) => {
    const poId = await createSubmittedPurchaseOrder(request, oneLineBody());

    const firstResponse = await postReceive(request, poId, {
      items: [{ sku: 'LUM-2X4-8', quantity: 6 }],
    });
    const first = await readPurchaseOrder(request, firstResponse, 200);
    expect(first.id).toBe(poId);
    expect(first.status).toBe('submitted');

    const secondResponse = await postReceive(request, poId, {
      items: [{ sku: 'LUM-2X4-8', quantity: 5 }],
    });
    await expectErrorRule(request, secondResponse, 400, 'receive_quantity_limit');
  });

  test('RCV-23 rejects a delivery on a draft purchase order', apiTag, async ({ request }) => {
    const poId = await createPurchaseOrder(request, oneLineBody());
    const response = await postReceive(request, poId, curlReceipt);
    await expectErrorRule(request, response, 400, 'workflow_gate');
  });

  test('RCV-24 returns 404 for an unknown purchase order', apiTag, async ({ request }) => {
    const response = await postReceive(request, 'po-does-not-exist', curlReceipt);
    await expectRuleAbsent(request, response);
  });
});
