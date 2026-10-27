import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { expectSchema } from './helpers/schema';

const apiTag = { tag: '@api' };

interface InvoiceLineCore {
  sku: string;
  quantity: number;
  unit_price: number;
}

interface InvoiceCore {
  id: string;
  po_id: string;
  vendor_id: string;
  invoice_number: string;
  status: string;
  line_items: InvoiceLineCore[];
  matched: boolean;
  partial_receipt: boolean | null;
}

interface MatchFlags {
  invoice_id: string;
  po_id: string;
  status: string;
  matched: boolean;
  partial_receipt: boolean;
}

interface NamedLine {
  sku: string;
  quantity: number;
  unit_price: number;
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

const workedReceipt = {
  items: [
    { sku: 'LUM-2X4-8', quantity: 10 },
    { sku: 'CEM-30KG', quantity: 4 },
  ],
};

const curlLine: NamedLine = { sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 };

const workedInvoiceLines: NamedLine[] = [
  { sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 },
  { sku: 'CEM-30KG', quantity: 4, unit_price: 11.9 },
];

function oneLinePo(quantity = 10, unitPrice = 4.75, vendorId = 'vnd-001') {
  return {
    vendor_id: vendorId,
    line_items: [{ sku: 'LUM-2X4-8', quantity, unit_price: unitPrice }],
  };
}

function lumberReceipt(quantity: number) {
  return { items: [{ sku: 'LUM-2X4-8', quantity }] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInvoiceLine(value: unknown): value is InvoiceLineCore {
  return (
    isRecord(value) &&
    typeof value.sku === 'string' &&
    typeof value.quantity === 'number' &&
    typeof value.unit_price === 'number'
  );
}

function isInvoiceCore(value: unknown): value is InvoiceCore {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.po_id === 'string' &&
    typeof value.vendor_id === 'string' &&
    typeof value.invoice_number === 'string' &&
    typeof value.status === 'string' &&
    Array.isArray(value.line_items) &&
    value.line_items.every(isInvoiceLine) &&
    typeof value.matched === 'boolean' &&
    (value.partial_receipt === null || typeof value.partial_receipt === 'boolean')
  );
}

function isMatchFlags(value: unknown): value is MatchFlags {
  return (
    isRecord(value) &&
    typeof value.invoice_id === 'string' &&
    typeof value.po_id === 'string' &&
    typeof value.status === 'string' &&
    typeof value.matched === 'boolean' &&
    typeof value.partial_receipt === 'boolean'
  );
}

function isErrorBody(value: unknown): value is { detail: string } & Record<string, unknown> {
  return isRecord(value) && typeof value.detail === 'string';
}

function postJson(request: APIRequestContext, path: string, data: unknown): Promise<APIResponse> {
  return request.post(path, {
    headers: { 'Content-Type': 'application/json' },
    data,
  });
}

function postInvoice(request: APIRequestContext, data: unknown): Promise<APIResponse> {
  return postJson(request, '/invoices', data);
}

function invoiceBody(poId: string, invoiceNumber: string, lineItems: NamedLine[]) {
  return {
    po_id: poId,
    invoice_number: invoiceNumber,
    line_items: lineItems,
  };
}

async function readInvoice(
  request: APIRequestContext,
  response: APIResponse,
  status: number,
): Promise<InvoiceCore> {
  expect(response.status()).toBe(status);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Invoice');
  if (!isInvoiceCore(body)) {
    throw new Error('response did not match Invoice');
  }
  return body;
}

function expectReceived(invoice: InvoiceCore, invoiceNumber: string): void {
  expect(invoice.id.startsWith('inv-')).toBe(true);
  expect(invoice.invoice_number).toBe(invoiceNumber);
  expect(invoice.status).toBe('received');
  expect(invoice.matched).toBe(false);
  expect(invoice.partial_receipt).toBe(null);
}

function expectNamedLines(invoice: InvoiceCore, lines: NamedLine[]): void {
  expect(invoice.line_items).toHaveLength(lines.length);
  for (const line of lines) {
    const match = invoice.line_items.find((item) => item.sku === line.sku);
    expect(match).toEqual(
      expect.objectContaining({
        sku: line.sku,
        quantity: line.quantity,
        unit_price: line.unit_price,
      }),
    );
  }
}

function expectQuantityAndPrice(invoice: InvoiceCore, quantity: number, unitPrice: number): void {
  expect(invoice.line_items).toHaveLength(1);
  const line = invoice.line_items[0];
  if (!line) {
    throw new Error('invoice line was missing');
  }
  expect(line.quantity).toBe(quantity);
  expect(line.unit_price).toBe(unitPrice);
}

async function createPurchaseOrder(request: APIRequestContext, data: object): Promise<string> {
  const response = await postJson(request, '/purchase-orders', data);
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'PurchaseOrder');
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw new Error('POST /purchase-orders did not return an id');
  }
  return body.id;
}

async function submitPurchaseOrder(request: APIRequestContext, poId: string): Promise<void> {
  const response = await request.post(`/purchase-orders/${poId}/submit`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'PurchaseOrder');
}

async function receivePurchaseOrder(
  request: APIRequestContext,
  poId: string,
  data: object,
  expectedStatus?: string,
): Promise<void> {
  const response = await postJson(request, `/purchase-orders/${poId}/receive`, data);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'PurchaseOrder');
  if (expectedStatus !== undefined) {
    if (!isRecord(body) || typeof body.status !== 'string') {
      throw new Error('receive response did not include status');
    }
    expect(body.status).toBe(expectedStatus);
  }
}

async function readyPurchaseOrder(
  request: APIRequestContext,
  po: object,
  receipt: object,
): Promise<string> {
  const poId = await createPurchaseOrder(request, po);
  await submitPurchaseOrder(request, poId);
  await receivePurchaseOrder(request, poId, receipt);
  return poId;
}

function readyOneLine(request: APIRequestContext, vendorId = 'vnd-001'): Promise<string> {
  return readyPurchaseOrder(request, oneLinePo(10, 4.75, vendorId), curlReceipt);
}

async function submittedWorkedExample(request: APIRequestContext): Promise<string> {
  const poId = await createPurchaseOrder(request, workedExample);
  await submitPurchaseOrder(request, poId);
  return poId;
}

async function heldPartialPo(request: APIRequestContext, expectedStatus?: string): Promise<string> {
  const poId = await createPurchaseOrder(request, oneLinePo());
  await submitPurchaseOrder(request, poId);
  await receivePurchaseOrder(
    request,
    poId,
    { items: [{ sku: 'LUM-2X4-8', quantity: 4 }] },
    expectedStatus,
  );
  return poId;
}

async function createReceivedInvoice(
  request: APIRequestContext,
  poId: string,
  invoiceNumber: string,
  lineItems: NamedLine[],
): Promise<InvoiceCore> {
  const response = await postInvoice(request, invoiceBody(poId, invoiceNumber, lineItems));
  const invoice = await readInvoice(request, response, 201);
  expectReceived(invoice, invoiceNumber);
  return invoice;
}

async function readMatch(request: APIRequestContext, response: APIResponse): Promise<MatchFlags> {
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'MatchResult');
  if (!isMatchFlags(body)) {
    throw new Error('response did not match MatchResult');
  }
  return body;
}

function expectMatch(
  result: MatchFlags,
  invoiceId: string,
  poId: string,
  partialReceipt: boolean,
): void {
  expect(result.invoice_id).toBe(invoiceId);
  expect(result.po_id).toBe(poId);
  expect(result.status).toBe('matched');
  expect(result.matched).toBe(true);
  expect(result.partial_receipt).toBe(partialReceipt);
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

async function createVendor(request: APIRequestContext, name: string): Promise<string> {
  const response = await postJson(request, '/vendors', { name });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Vendor');
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw new Error('POST /vendors did not return an id');
  }
  expect(body.id.startsWith('vnd-')).toBe(true);
  return body.id;
}

async function expectClosedPurchaseOrder(request: APIRequestContext, poId: string): Promise<void> {
  const response = await request.get(`/purchase-orders/${poId}`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'PurchaseOrder');
  if (!isRecord(body) || typeof body.status !== 'string') {
    throw new Error('purchase order response did not include status');
  }
  expect(body.status).toBe('closed');
}

async function approveInvoice(request: APIRequestContext, invoiceId: string): Promise<void> {
  const response = await request.post(`/invoices/${invoiceId}/approve`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'ApproveResult');
  if (!isRecord(body) || typeof body.status !== 'string') {
    throw new Error('approve response did not include status');
  }
  expect(body.status).toBe('approved');
}

test.describe('invoices', () => {
  test('INV-01 records the curl invoice on a ready one-line purchase order', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const invoice = await createReceivedInvoice(request, poId, 'INV-1001', [curlLine]);
    expect(invoice.po_id).toBe(poId);
    expectNamedLines(invoice, [curlLine]);
  });

  test('INV-02 records both lines of the worked example', apiTag, async ({ request }) => {
    const poId = await submittedWorkedExample(request);
    await receivePurchaseOrder(request, poId, workedReceipt);
    const invoice = await createReceivedInvoice(request, poId, 'INV-WORKED', workedInvoiceLines);
    expect(invoice.po_id).toBe(poId);
    expectNamedLines(invoice, workedInvoiceLines);
  });

  test('INV-03 records an invoice on a closed purchase order', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    await expectClosedPurchaseOrder(request, poId);
    const invoice = await createReceivedInvoice(request, poId, 'INV-CLOSED', [curlLine]);
    expect(invoice.po_id).toBe(poId);
    expectNamedLines(invoice, [curlLine]);
  });

  test('INV-04 records an invoice equal to a partial receipt', apiTag, async ({ request }) => {
    const poId = await heldPartialPo(request, 'submitted');
    const invoice = await createReceivedInvoice(request, poId, 'INV-PART-EQ', [
      { sku: 'LUM-2X4-8', quantity: 4, unit_price: 4.75 },
    ]);
    expect(invoice.po_id).toBe(poId);
    expectQuantityAndPrice(invoice, 4, 4.75);
  });

  test('INV-05 records an invoice for the only received line', apiTag, async ({ request }) => {
    const poId = await submittedWorkedExample(request);
    await receivePurchaseOrder(request, poId, curlReceipt, 'submitted');
    const invoice = await createReceivedInvoice(request, poId, 'INV-PART-LINE', [curlLine]);
    expect(invoice.po_id).toBe(poId);
    expectNamedLines(invoice, [curlLine]);
  });

  test('INV-06 accepts the smallest valid invoice quantity', apiTag, async ({ request }) => {
    const poId = await readyPurchaseOrder(request, oneLinePo(1), lumberReceipt(1));
    const invoice = await createReceivedInvoice(request, poId, 'INV-QTY-1', [
      { sku: 'LUM-2X4-8', quantity: 1, unit_price: 4.75 },
    ]);
    expectQuantityAndPrice(invoice, 1, 4.75);
  });

  test('INV-07 accepts the maximum invoice quantity', apiTag, async ({ request }) => {
    const poId = await readyPurchaseOrder(request, oneLinePo(10000), lumberReceipt(10000));
    const invoice = await createReceivedInvoice(request, poId, 'INV-QTY-MAX', [
      { sku: 'LUM-2X4-8', quantity: 10000, unit_price: 4.75 },
    ]);
    expectQuantityAndPrice(invoice, 10000, 4.75);
  });

  test('INV-08 accepts a zero invoice unit price', apiTag, async ({ request }) => {
    const poId = await readyPurchaseOrder(request, oneLinePo(1, 0), lumberReceipt(1));
    const invoice = await createReceivedInvoice(request, poId, 'INV-PRICE-0', [
      { sku: 'LUM-2X4-8', quantity: 1, unit_price: 0 },
    ]);
    expectQuantityAndPrice(invoice, 1, 0);
  });

  test('INV-09 accepts the maximum invoice unit price', apiTag, async ({ request }) => {
    const poId = await readyPurchaseOrder(request, oneLinePo(1, 100000), lumberReceipt(1));
    const invoice = await createReceivedInvoice(request, poId, 'INV-PRICE-MAX', [
      { sku: 'LUM-2X4-8', quantity: 1, unit_price: 100000 },
    ]);
    expectQuantityAndPrice(invoice, 1, 100000);
  });

  test('INV-10 records two invoice numbers for the same vendor', apiTag, async ({ request }) => {
    const firstPoId = await readyOneLine(request);
    const secondPoId = await readyOneLine(request);
    const first = await createReceivedInvoice(request, firstPoId, 'INV-NUM-A', [curlLine]);
    const second = await createReceivedInvoice(request, secondPoId, 'INV-NUM-B', [curlLine]);
    expect(first.id).not.toBe(second.id);
  });

  test('INV-11 records the same invoice number for two vendors', apiTag, async ({ request }) => {
    const vendorId = await createVendor(request, 'Harbor Pine Supply');
    const seedPoId = await readyOneLine(request);
    const otherPoId = await readyOneLine(request, vendorId);
    const seedInvoice = await createReceivedInvoice(request, seedPoId, 'INV-CROSS-VENDOR', [curlLine]);
    const otherInvoice = await createReceivedInvoice(request, otherPoId, 'INV-CROSS-VENDOR', [curlLine]);
    expect(seedInvoice.id).not.toBe(otherInvoice.id);
  });

  test('INV-12 accepts an invoice number of length 1', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const invoice = await createReceivedInvoice(request, poId, 'A', [curlLine]);
    expect(invoice.line_items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 }),
      ]),
    );
  });

  test('INV-13 rejects an invoice with no po_id', apiTag, async ({ request }) => {
    await readyOneLine(request);
    const response = await postInvoice(request, {
      invoice_number: 'INV-NEG-13',
      line_items: [curlLine],
    });
    await expectValidationError(request, response);
  });

  test('INV-14 rejects an invoice with no invoice_number', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const response = await postInvoice(request, {
      po_id: poId,
      line_items: [curlLine],
    });
    await expectValidationError(request, response);
  });

  test('INV-15 rejects an invoice with no line_items', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const response = await postInvoice(request, {
      po_id: poId,
      invoice_number: 'INV-NEG-15',
    });
    await expectValidationError(request, response);
  });

  test('INV-16 rejects an invoice line with no sku', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const response = await postInvoice(request, {
      po_id: poId,
      invoice_number: 'INV-NEG-16',
      line_items: [{ quantity: 10, unit_price: 4.75 }],
    });
    await expectValidationError(request, response);
  });

  test('INV-17 rejects an invoice line with no quantity', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const response = await postInvoice(request, {
      po_id: poId,
      invoice_number: 'INV-NEG-17',
      line_items: [{ sku: 'LUM-2X4-8', unit_price: 4.75 }],
    });
    await expectValidationError(request, response);
  });

  test('INV-18 rejects an invoice line with no unit_price', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const response = await postInvoice(request, {
      po_id: poId,
      invoice_number: 'INV-NEG-18',
      line_items: [{ sku: 'LUM-2X4-8', quantity: 10 }],
    });
    await expectValidationError(request, response);
  });

  test('INV-19 rejects an empty invoice sku', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const response = await postInvoice(request, {
      po_id: poId,
      invoice_number: 'INV-NEG-19',
      line_items: [{ sku: '', quantity: 10, unit_price: 4.75 }],
    });
    await expectValidationError(request, response);
  });

  test('INV-20 rejects an invoice quantity of zero', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const response = await postInvoice(
      request,
      invoiceBody(poId, 'INV-NEG-20', [{ sku: 'LUM-2X4-8', quantity: 0, unit_price: 4.75 }]),
    );
    await expectValidationError(request, response);
  });

  test('INV-21 rejects a negative invoice quantity', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const response = await postInvoice(
      request,
      invoiceBody(poId, 'INV-NEG-21', [{ sku: 'LUM-2X4-8', quantity: -1, unit_price: 4.75 }]),
    );
    await expectValidationError(request, response);
  });

  test('INV-22 rejects a negative invoice unit price', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const response = await postInvoice(
      request,
      invoiceBody(poId, 'INV-NEG-22', [{ sku: 'LUM-2X4-8', quantity: 10, unit_price: -1 }]),
    );
    await expectValidationError(request, response);
  });

  test('INV-23 rejects a non-string po_id', apiTag, async ({ request }) => {
    await readyOneLine(request);
    const response = await postInvoice(request, {
      po_id: 1,
      invoice_number: 'INV-NEG-23',
      line_items: [curlLine],
    });
    await expectValidationError(request, response);
  });

  test('INV-24 rejects a non-string invoice_number', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const response = await postInvoice(request, {
      po_id: poId,
      invoice_number: 1001,
      line_items: [curlLine],
    });
    await expectValidationError(request, response);
  });

  test('INV-25 rejects line_items that is not an array', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const response = await postInvoice(request, {
      po_id: poId,
      invoice_number: 'INV-NEG-25',
      line_items: { sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 },
    });
    await expectValidationError(request, response);
  });

  test('INV-26 rejects an invoice line that is not an object', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const response = await postInvoice(request, {
      po_id: poId,
      invoice_number: 'INV-NEG-26',
      line_items: ['LUM-2X4-8'],
    });
    await expectValidationError(request, response);
  });

  test('INV-27 rejects a non-string sku', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const response = await postInvoice(request, {
      po_id: poId,
      invoice_number: 'INV-NEG-27',
      line_items: [{ sku: 1, quantity: 10, unit_price: 4.75 }],
    });
    await expectValidationError(request, response);
  });

  test('INV-28 rejects a non-number quantity', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const response = await postInvoice(request, {
      po_id: poId,
      invoice_number: 'INV-NEG-28',
      line_items: [{ sku: 'LUM-2X4-8', quantity: '10', unit_price: 4.75 }],
    });
    await expectValidationError(request, response);
  });

  test('INV-29 rejects a non-number unit price', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const response = await postInvoice(request, {
      po_id: poId,
      invoice_number: 'INV-NEG-29',
      line_items: [{ sku: 'LUM-2X4-8', quantity: 10, unit_price: '4.75' }],
    });
    await expectValidationError(request, response);
  });

  test('INV-30 rejects an array body', apiTag, async ({ request }) => {
    await readyOneLine(request);
    const response = await postInvoice(request, []);
    await expectValidationError(request, response);
  });

  test('INV-31 returns 404 for an unknown purchase order', apiTag, async ({ request }) => {
    const response = await postInvoice(request, invoiceBody('po-does-not-exist', 'INV-UNKNOWN-PO', [curlLine]));
    await expectRuleAbsent(request, response);
  });

  test('INV-32 rejects a repeated invoice number for the same vendor', apiTag, async ({ request }) => {
    const firstPoId = await readyOneLine(request);
    const secondPoId = await readyOneLine(request);
    const firstResponse = await postInvoice(request, invoiceBody(firstPoId, 'INV-DUP-EXACT', [curlLine]));
    const first = await readInvoice(request, firstResponse, 201);
    expect(first.status).toBe('received');
    expect(first.invoice_number).toBe('INV-DUP-EXACT');

    const secondResponse = await postInvoice(request, invoiceBody(secondPoId, 'INV-DUP-EXACT', [curlLine]));
    await expectErrorRule(request, secondResponse, 400, 'duplicate_invoice_detection');
  });

  test('INV-33 rejects invoice numbers that match ignoring case and surrounding spaces', apiTag, async ({ request }) => {
    test.fail(true, 'BUG-2: a case-only invoice number is accepted');
    const firstPoId = await readyOneLine(request);
    const secondPoId = await readyOneLine(request);
    const thirdPoId = await readyOneLine(request);

    const firstResponse = await postInvoice(request, invoiceBody(firstPoId, 'INV-7', [curlLine]));
    const first = await readInvoice(request, firstResponse, 201);
    expect(first.invoice_number).toBe('INV-7');

    const secondResponse = await postInvoice(request, invoiceBody(secondPoId, 'inv-7', [curlLine]));
    await expectErrorRule(request, secondResponse, 400, 'duplicate_invoice_detection');

    const thirdResponse = await postInvoice(request, invoiceBody(thirdPoId, ' INV-7 ', [curlLine]));
    await expectErrorRule(request, thirdResponse, 400, 'duplicate_invoice_detection');
  });

  test('rejects an invoice one cent over the received value', apiTag, async ({ request }) => {
    test.fail(true, 'BUG-1: an invoice one cent over the received value returns 201');
    const vendorId = await createVendor(request, `Over Cent ${Date.now()}`);
    const poId = await readyPurchaseOrder(request, oneLinePo(1, 4.75, vendorId), lumberReceipt(1));
    const response = await postInvoice(
      request,
      invoiceBody(poId, `INV-CENT-${Date.now()}`, [{ sku: 'LUM-2X4-8', quantity: 1, unit_price: 4.76 }]),
    );
    await expectErrorRule(request, response, 400, 'overpayment_protection');
  });

  test('INVGET-01 reads a received invoice', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const created = await createReceivedInvoice(request, poId, 'INV-GET-1', [curlLine]);

    const response = await request.get(`/invoices/${created.id}`);
    const invoice = await readInvoice(request, response, 200);
    expect(invoice.id).toBe(created.id);
    expect(invoice.id.startsWith('inv-')).toBe(true);
    expect(invoice.po_id).toBe(poId);
    expect(invoice.invoice_number).toBe('INV-GET-1');
    expect(invoice.status).toBe('received');
    expect(invoice.matched).toBe(false);
    expect(invoice.partial_receipt).toBe(null);
    expectNamedLines(invoice, [curlLine]);
  });

  test('INVGET-02 reads a matched invoice after a full receipt', apiTag, async ({ request }) => {
    const poId = await submittedWorkedExample(request);
    await receivePurchaseOrder(request, poId, workedReceipt);
    const createdResponse = await postInvoice(request, invoiceBody(poId, 'INV-GET-MATCHED', workedInvoiceLines));
    const created = await readInvoice(request, createdResponse, 201);
    expect(created.status).toBe('received');

    const matchResponse = await request.post(`/invoices/${created.id}/match`);
    expect(matchResponse.status()).toBe(200);
    const matchBody: unknown = await matchResponse.json();
    await expectSchema(request, matchBody, 'MatchResult');

    const response = await request.get(`/invoices/${created.id}`);
    const invoice = await readInvoice(request, response, 200);
    expect(invoice.id).toBe(created.id);
    expect(invoice.status).toBe('matched');
    expect(invoice.matched).toBe(true);
    expect(invoice.partial_receipt).toBe(false);
    expect(invoice.invoice_number).toBe('INV-GET-MATCHED');
  });

  test('INVGET-03 reads a matched invoice after a partial receipt', apiTag, async ({ request }) => {
    const poId = await heldPartialPo(request);
    const createdResponse = await postInvoice(request, invoiceBody(poId, 'INV-GET-PART', [
      { sku: 'LUM-2X4-8', quantity: 4, unit_price: 4.75 },
    ]));
    const created = await readInvoice(request, createdResponse, 201);
    expect(created.status).toBe('received');

    const matchResponse = await request.post(`/invoices/${created.id}/match`);
    expect(matchResponse.status()).toBe(200);
    const matchBody: unknown = await matchResponse.json();
    await expectSchema(request, matchBody, 'MatchResult');

    const response = await request.get(`/invoices/${created.id}`);
    const invoice = await readInvoice(request, response, 200);
    expect(invoice.id).toBe(created.id);
    expect(invoice.status).toBe('matched');
    expect(invoice.matched).toBe(true);
    expect(invoice.partial_receipt).toBe(true);
    expect(invoice.invoice_number).toBe('INV-GET-PART');
  });

  test('INVGET-04 reads an approved invoice', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const createdResponse = await postInvoice(request, invoiceBody(poId, 'INV-GET-APPR', [curlLine]));
    const created = await readInvoice(request, createdResponse, 201);

    const matchResponse = await request.post(`/invoices/${created.id}/match`);
    const match = await readMatch(request, matchResponse);
    expect(match.status).toBe('matched');
    await approveInvoice(request, created.id);

    const response = await request.get(`/invoices/${created.id}`);
    const invoice = await readInvoice(request, response, 200);
    expect(invoice.id).toBe(created.id);
    expect(invoice.status).toBe('approved');
    expect(invoice.invoice_number).toBe('INV-GET-APPR');
  });

  test('INVGET-05 returns the same invoice on a repeated read', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const created = await createReceivedInvoice(request, poId, 'INV-GET-TWICE', [curlLine]);

    const firstResponse = await request.get(`/invoices/${created.id}`);
    const secondResponse = await request.get(`/invoices/${created.id}`);
    const first = await readInvoice(request, firstResponse, 200);
    const second = await readInvoice(request, secondResponse, 200);

    expect(first.id).toBe(created.id);
    expect(second.id).toBe(created.id);
    expect(first.status).toBe('received');
    expect(second.status).toBe('received');
    expect(first.invoice_number).toBe('INV-GET-TWICE');
    expect(second.invoice_number).toBe('INV-GET-TWICE');
    expectNamedLines(first, [curlLine]);
    expectNamedLines(second, [curlLine]);
    expect(first.line_items[0]?.sku).toBe(second.line_items[0]?.sku);
    expect(first.line_items[0]?.quantity).toBe(second.line_items[0]?.quantity);
    expect(first.line_items[0]?.unit_price).toBe(second.line_items[0]?.unit_price);
  });

  test('INVGET-06 returns 404 for an unknown invoice', apiTag, async ({ request }) => {
    const response = await request.get('/invoices/inv-does-not-exist');
    await expectRuleAbsent(request, response);
  });

  test('MATCH-01 matches the worked example', apiTag, async ({ request }) => {
    const poId = await submittedWorkedExample(request);
    await receivePurchaseOrder(request, poId, workedReceipt);
    const createdResponse = await postInvoice(request, invoiceBody(poId, 'INV-MATCH-95', workedInvoiceLines));
    const created = await readInvoice(request, createdResponse, 201);
    expect(created.status).toBe('received');

    const response = await request.post(`/invoices/${created.id}/match`);
    const result = await readMatch(request, response);
    expectMatch(result, created.id, poId, false);
    if (!isRecord(result)) {
      throw new Error('match response was not an object');
    }
    expect(result.ordered_value).toBe(95.1);
    expect(result.received_value).toBe(95.1);
    expect(result.invoice_total).toBe(95.1);
    expect(result.message).toBe('3-way match passed.');
  });

  test('MATCH-02 matches one fully received line', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const createdResponse = await postInvoice(request, invoiceBody(poId, 'INV-MATCH-1', [curlLine]));
    const created = await readInvoice(request, createdResponse, 201);
    expect(created.status).toBe('received');

    const response = await request.post(`/invoices/${created.id}/match`);
    const result = await readMatch(request, response);
    expectMatch(result, created.id, poId, false);
  });

  test('MATCH-03 matches an invoice after a partial receipt', apiTag, async ({ request }) => {
    const poId = await heldPartialPo(request);
    const createdResponse = await postInvoice(request, invoiceBody(poId, 'INV-MATCH-PART', [
      { sku: 'LUM-2X4-8', quantity: 4, unit_price: 4.75 },
    ]));
    const created = await readInvoice(request, createdResponse, 201);
    expect(created.status).toBe('received');

    const response = await request.post(`/invoices/${created.id}/match`);
    const result = await readMatch(request, response);
    expectMatch(result, created.id, poId, true);
  });

  test('MATCH-04 matches when another ordered line was not received', apiTag, async ({ request }) => {
    test.fail(true, 'BUG-3: partial_receipt stays false when another ordered line was not received');
    const poId = await submittedWorkedExample(request);
    await receivePurchaseOrder(request, poId, curlReceipt);
    const createdResponse = await postInvoice(request, invoiceBody(poId, 'INV-MATCH-PART2', [curlLine]));
    const created = await readInvoice(request, createdResponse, 201);
    expect(created.status).toBe('received');

    const response = await request.post(`/invoices/${created.id}/match`);
    const result = await readMatch(request, response);
    expectMatch(result, created.id, poId, true);
  });

  test('MATCH-05 returns 404 for an unknown invoice', apiTag, async ({ request }) => {
    const response = await request.post('/invoices/inv-does-not-exist/match');
    await expectRuleAbsent(request, response);
  });

  test('MATCH-06 rejects a match after the invoice is approved', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const createdResponse = await postInvoice(request, invoiceBody(poId, 'INV-MATCH-APPR', [curlLine]));
    const created = await readInvoice(request, createdResponse, 201);

    const firstMatch = await request.post(`/invoices/${created.id}/match`);
    const matched = await readMatch(request, firstMatch);
    expect(matched.status).toBe('matched');
    await approveInvoice(request, created.id);

    const secondMatch = await request.post(`/invoices/${created.id}/match`);
    await expectErrorRule(request, secondMatch, 400, 'workflow_gate');
  });
});
