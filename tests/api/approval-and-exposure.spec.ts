import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { expectSchema } from './helpers/schema';

const apiTag = { tag: '@api' };

interface NamedLine {
  sku: string;
  quantity: number;
  unit_price: number;
}

interface InvoiceRef {
  id: string;
  status: string;
}

interface MatchFlags {
  status: string;
  matched: boolean;
  partial_receipt: boolean;
}

interface GlLine {
  account: string;
  amount: number;
}

interface ApproveBody {
  invoice_id: string;
  status: string;
  vendor_exposure: number;
  gl_entry: {
    balanced: boolean;
    debits: GlLine[];
    credits: GlLine[];
  };
}

interface ExposureBody {
  vendor_id: string;
  open_ap_liability: number;
  approved_invoices: string[];
}

const oneLineVendor = 'vnd-001';

const workedPurchaseOrder = {
  vendor_id: oneLineVendor,
  line_items: [
    { sku: 'LUM-2X4-8', description: '2x4 stud, 8 ft', quantity: 10, unit_price: 4.75 },
    { sku: 'CEM-30KG', quantity: 4, unit_price: 11.9 },
  ],
};

const curlReceipt = {
  items: [{ sku: 'LUM-2X4-8', quantity: 10 }],
};

const partialReceipt = {
  items: [{ sku: 'LUM-2X4-8', quantity: 4 }],
};

const workedReceipt = {
  items: [
    { sku: 'LUM-2X4-8', quantity: 10 },
    { sku: 'CEM-30KG', quantity: 4 },
  ],
};

const curlLine: NamedLine = { sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 };

const partialLine: NamedLine = { sku: 'LUM-2X4-8', quantity: 4, unit_price: 4.75 };

const workedInvoiceLines: NamedLine[] = [
  { sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 },
  { sku: 'CEM-30KG', quantity: 4, unit_price: 11.9 },
];

function oneLinePo(vendorId: string = oneLineVendor) {
  return {
    vendor_id: vendorId,
    line_items: [{ sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 }],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInvoiceRef(value: unknown): value is InvoiceRef {
  return isRecord(value) && typeof value.id === 'string' && typeof value.status === 'string';
}

function isMatchFlags(value: unknown): value is MatchFlags & Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.status === 'string' &&
    typeof value.matched === 'boolean' &&
    typeof value.partial_receipt === 'boolean'
  );
}

function isGlLine(value: unknown): value is GlLine {
  return isRecord(value) && typeof value.account === 'string' && typeof value.amount === 'number';
}

function isApproveBody(value: unknown): value is ApproveBody {
  return (
    isRecord(value) &&
    typeof value.invoice_id === 'string' &&
    typeof value.status === 'string' &&
    typeof value.vendor_exposure === 'number' &&
    isRecord(value.gl_entry) &&
    typeof value.gl_entry.balanced === 'boolean' &&
    Array.isArray(value.gl_entry.debits) &&
    value.gl_entry.debits.every(isGlLine) &&
    Array.isArray(value.gl_entry.credits) &&
    value.gl_entry.credits.every(isGlLine)
  );
}

function isExposureBody(value: unknown): value is ExposureBody {
  return (
    isRecord(value) &&
    typeof value.vendor_id === 'string' &&
    typeof value.open_ap_liability === 'number' &&
    Array.isArray(value.approved_invoices) &&
    value.approved_invoices.every((item) => typeof item === 'string')
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

function postApprove(request: APIRequestContext, invoiceId: string): Promise<APIResponse> {
  return request.post(`/invoices/${invoiceId}/approve`);
}

function sumAmounts(lines: GlLine[]): number {
  return lines.reduce((total, line) => total + line.amount, 0);
}

function expectBalancedTotals(approve: ApproveBody): void {
  expect(approve.gl_entry.balanced).toBe(true);
  expect(sumAmounts(approve.gl_entry.debits)).toBe(sumAmounts(approve.gl_entry.credits));
}

function expectExposureNumber(approve: ApproveBody): void {
  expect(typeof approve.vendor_exposure).toBe('number');
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

function readyOneLine(request: APIRequestContext, vendorId: string = oneLineVendor): Promise<string> {
  return readyPurchaseOrder(request, oneLinePo(vendorId), curlReceipt);
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

async function heldPartialPo(request: APIRequestContext): Promise<string> {
  const poId = await createPurchaseOrder(request, oneLinePo());
  await submitPurchaseOrder(request, poId);
  await receivePurchaseOrder(request, poId, partialReceipt, 'submitted');
  return poId;
}

function invoiceBody(poId: string, invoiceNumber: string, lineItems: NamedLine[]) {
  return {
    po_id: poId,
    invoice_number: invoiceNumber,
    line_items: lineItems,
  };
}

async function createReceivedInvoice(
  request: APIRequestContext,
  poId: string,
  invoiceNumber: string,
  lineItems: NamedLine[],
): Promise<InvoiceRef> {
  const response = await postJson(request, '/invoices', invoiceBody(poId, invoiceNumber, lineItems));
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Invoice');
  if (!isInvoiceRef(body)) {
    throw new Error('invoice response did not include id and status');
  }
  expect(body.status).toBe('received');
  return body;
}

async function matchInvoice(
  request: APIRequestContext,
  invoiceId: string,
): Promise<MatchFlags & Record<string, unknown>> {
  const response = await request.post(`/invoices/${invoiceId}/match`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'MatchResult');
  if (!isMatchFlags(body)) {
    throw new Error('response did not match MatchResult');
  }
  return body;
}

async function readApprove(request: APIRequestContext, response: APIResponse): Promise<ApproveBody> {
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'ApproveResult');
  if (!isApproveBody(body)) {
    throw new Error('approve response did not match ApproveResult');
  }
  return body;
}

async function readInvoiceTotalAmount(request: APIRequestContext, invoiceId: string): Promise<number> {
  const response = await request.get(`/invoices/${invoiceId}`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Invoice');
  if (!isRecord(body) || typeof body.total_amount !== 'number') {
    throw new Error('invoice response did not include total_amount');
  }
  return body.total_amount;
}

async function readExposure(request: APIRequestContext, vendorId: string): Promise<ExposureBody> {
  const response = await request.get(`/vendors/${vendorId}/exposure`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'VendorExposure');
  if (!isExposureBody(body)) {
    throw new Error('exposure response did not match VendorExposure');
  }
  return body;
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

test.describe('approval and exposure', () => {
  test('APR-01 approves a matched invoice after one fully received line', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const invoice = await createReceivedInvoice(request, poId, 'APR-1001', [curlLine]);
    const match = await matchInvoice(request, invoice.id);
    expect(match.status).toBe('matched');
    expect(match.matched).toBe(true);

    const approve = await readApprove(request, await postApprove(request, invoice.id));
    expect(approve.invoice_id).toBe(invoice.id);
    expect(approve.status).toBe('approved');
    expectBalancedTotals(approve);
    expectExposureNumber(approve);
  });

  test('APR-02 approves the worked invoice and posts the worked ledger', apiTag, async ({ request }) => {
    const poId = await createPurchaseOrder(request, workedPurchaseOrder);
    await submitPurchaseOrder(request, poId);
    await receivePurchaseOrder(request, poId, workedReceipt);
    const invoice = await createReceivedInvoice(request, poId, 'APR-WORKED', workedInvoiceLines);

    const match = await matchInvoice(request, invoice.id);
    expect(match.status).toBe('matched');
    expect(match.matched).toBe(true);
    expect(match.partial_receipt).toBe(false);
    expect(match.ordered_value).toBe(95.1);
    expect(match.received_value).toBe(95.1);
    expect(match.invoice_total).toBe(95.1);
    expect(match.message).toBe('3-way match passed.');

    const approve = await readApprove(request, await postApprove(request, invoice.id));
    expect(approve.invoice_id).toBe(invoice.id);
    expect(approve.status).toBe('approved');
    expect(approve.gl_entry.debits).toHaveLength(1);
    const debit = approve.gl_entry.debits[0];
    if (!debit) {
      throw new Error('approve debit line was missing');
    }
    expect(debit.account).toBe('5000 Materials Expense');
    expect(debit.amount).toBe(95.1);
    expect(approve.gl_entry.credits).toHaveLength(1);
    const credit = approve.gl_entry.credits[0];
    if (!credit) {
      throw new Error('approve credit line was missing');
    }
    expect(credit.account).toBe('2000 Accounts Payable');
    expect(credit.amount).toBe(95.1);
    expect(approve.gl_entry.balanced).toBe(true);
    expectExposureNumber(approve);
  });

  test('APR-03 approves a matched invoice after a partial receipt', apiTag, async ({ request }) => {
    const poId = await heldPartialPo(request);
    const invoice = await createReceivedInvoice(request, poId, 'APR-PART', [partialLine]);
    const match = await matchInvoice(request, invoice.id);
    expect(match.status).toBe('matched');
    expect(match.matched).toBe(true);
    expect(match.partial_receipt).toBe(true);

    const approve = await readApprove(request, await postApprove(request, invoice.id));
    expect(approve.invoice_id).toBe(invoice.id);
    expect(approve.status).toBe('approved');
    expectBalancedTotals(approve);
    expectExposureNumber(approve);
  });

  test('APR-04 approves a second invoice once', apiTag, async ({ request }) => {
    const firstPoId = await readyOneLine(request);
    const secondPoId = await readyOneLine(request);
    const firstInvoice = await createReceivedInvoice(request, firstPoId, 'APR-ONCE-A', [curlLine]);
    const secondInvoice = await createReceivedInvoice(request, secondPoId, 'APR-ONCE-B', [curlLine]);

    const firstMatch = await matchInvoice(request, firstInvoice.id);
    expect(firstMatch.status).toBe('matched');
    expect(firstMatch.matched).toBe(true);
    const secondMatch = await matchInvoice(request, secondInvoice.id);
    expect(secondMatch.status).toBe('matched');
    expect(secondMatch.matched).toBe(true);

    const firstApprove = await readApprove(request, await postApprove(request, firstInvoice.id));
    expect(firstApprove.status).toBe('approved');

    const secondApprove = await readApprove(request, await postApprove(request, secondInvoice.id));
    expect(secondApprove.invoice_id).toBe(secondInvoice.id);
    expect(secondApprove.status).toBe('approved');
    expectBalancedTotals(secondApprove);
    expectExposureNumber(secondApprove);
    expect(firstApprove.invoice_id).not.toBe(secondApprove.invoice_id);
  });

  test('APR-05 sets vendor exposure to the invoice total amount', apiTag, async ({ request }) => {
    const vendorId = await createVendor(request, 'Approval Sum Supply');
    const poId = await readyOneLine(request, vendorId);
    const invoice = await createReceivedInvoice(request, poId, 'APR-SUM', [curlLine]);
    const match = await matchInvoice(request, invoice.id);
    expect(match.status).toBe('matched');
    expect(match.matched).toBe(true);
    const totalAmount = await readInvoiceTotalAmount(request, invoice.id);

    const approve = await readApprove(request, await postApprove(request, invoice.id));
    expect(approve.status).toBe('approved');
    expect(approve.invoice_id).toBe(invoice.id);
    expect(approve.vendor_exposure).toBe(totalAmount);
    expectBalancedTotals(approve);
  });

  test('APR-06 rejects approval before the 3-way match', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const invoice = await createReceivedInvoice(request, poId, 'APR-GATE', [curlLine]);

    const response = await postApprove(request, invoice.id);
    await expectErrorRule(request, response, 400, 'three_way_match_gate');
  });

  test('APR-07 rejects a repeated approval of the same invoice', apiTag, async ({ request }) => {
    const poId = await readyOneLine(request);
    const invoice = await createReceivedInvoice(request, poId, 'APR-REPEAT', [curlLine]);
    const match = await matchInvoice(request, invoice.id);
    expect(match.status).toBe('matched');

    const firstApprove = await readApprove(request, await postApprove(request, invoice.id));
    expect(firstApprove.status).toBe('approved');

    const secondApprove = await postApprove(request, invoice.id);
    await expectErrorRule(request, secondApprove, 400, 'duplicate_approval');
  });

  test('APR-08 returns 404 for an unknown invoice', apiTag, async ({ request }) => {
    const response = await postApprove(request, 'inv-does-not-exist');
    await expectRuleAbsent(request, response);
  });

  test('EXP-01 reads exposure for seed vendor vnd-001', apiTag, async ({ request }) => {
    const exposure = await readExposure(request, oneLineVendor);
    expect(exposure.vendor_id).toBe(oneLineVendor);
    expect(typeof exposure.open_ap_liability).toBe('number');
    expect(Array.isArray(exposure.approved_invoices)).toBe(true);
  });

  test('EXP-02 reads exposure for a vendor created in this test', apiTag, async ({ request }) => {
    const vendorId = await createVendor(request, 'Exposure Shape Supply');

    const exposure = await readExposure(request, vendorId);
    expect(exposure.vendor_id).toBe(vendorId);
    expect(typeof exposure.open_ap_liability).toBe('number');
    expect(Array.isArray(exposure.approved_invoices)).toBe(true);
  });

  test('EXP-03 reads exposure after one approval', apiTag, async ({ request }) => {
    const vendorId = await createVendor(request, 'Exposure Kiln Supply');
    const poId = await readyOneLine(request, vendorId);
    const invoice = await createReceivedInvoice(request, poId, 'EXP-AFTER', [curlLine]);
    const match = await matchInvoice(request, invoice.id);
    expect(match.status).toBe('matched');
    expect(match.matched).toBe(true);
    const approve = await readApprove(request, await postApprove(request, invoice.id));
    expect(approve.status).toBe('approved');
    const totalAmount = await readInvoiceTotalAmount(request, invoice.id);

    const exposure = await readExposure(request, vendorId);
    expect(exposure.vendor_id).toBe(vendorId);
    expect(exposure.open_ap_liability).toBe(totalAmount);
    expect(exposure.approved_invoices).toEqual([invoice.id]);
  });

  test('EXP-04 reads exposure before and after approval', apiTag, async ({ request }) => {
    const vendorId = await createVendor(request, 'Exposure Tide Supply');
    const poId = await readyOneLine(request, vendorId);
    const invoice = await createReceivedInvoice(request, poId, 'EXP-BEFORE', [curlLine]);
    const match = await matchInvoice(request, invoice.id);
    expect(match.status).toBe('matched');
    expect(match.matched).toBe(true);

    const before = await readExposure(request, vendorId);
    expect(before.vendor_id).toBe(vendorId);

    const approve = await readApprove(request, await postApprove(request, invoice.id));
    expect(approve.status).toBe('approved');
    const totalAmount = await readInvoiceTotalAmount(request, invoice.id);

    const after = await readExposure(request, vendorId);
    expect(after.vendor_id).toBe(vendorId);
    expect(after.open_ap_liability).toBe(totalAmount);
    expect(after.approved_invoices).toEqual([invoice.id]);
  });

  test('EXP-05 sums exposure across two approved invoices', apiTag, async ({ request }) => {
    const vendorId = await createVendor(request, 'Exposure Twin Supply');
    const firstPoId = await readyOneLine(request, vendorId);
    const secondPoId = await readyOneLine(request, vendorId);
    const firstInvoice = await createReceivedInvoice(request, firstPoId, 'EXP-MULTI-A', [curlLine]);
    const secondInvoice = await createReceivedInvoice(request, secondPoId, 'EXP-MULTI-B', [curlLine]);

    await matchInvoice(request, firstInvoice.id);
    const firstApprove = await readApprove(request, await postApprove(request, firstInvoice.id));
    expect(firstApprove.status).toBe('approved');
    await matchInvoice(request, secondInvoice.id);
    const secondApprove = await readApprove(request, await postApprove(request, secondInvoice.id));
    expect(secondApprove.status).toBe('approved');

    const firstTotal = await readInvoiceTotalAmount(request, firstInvoice.id);
    const secondTotal = await readInvoiceTotalAmount(request, secondInvoice.id);

    const exposure = await readExposure(request, vendorId);
    expect(exposure.vendor_id).toBe(vendorId);
    expect(exposure.open_ap_liability).toBe(firstTotal + secondTotal);
    expect(exposure.approved_invoices).toContain(firstInvoice.id);
    expect(exposure.approved_invoices).toContain(secondInvoice.id);
  });

  test('EXP-06 leaves a matched unapproved invoice out of exposure', apiTag, async ({ request }) => {
    const vendorId = await createVendor(request, 'Exposure Held Supply');
    const approvedPoId = await readyOneLine(request, vendorId);
    const approvedInvoice = await createReceivedInvoice(request, approvedPoId, 'EXP-HELD-YES', [curlLine]);
    const approvedMatch = await matchInvoice(request, approvedInvoice.id);
    expect(approvedMatch.status).toBe('matched');
    expect(approvedMatch.matched).toBe(true);
    const approve = await readApprove(request, await postApprove(request, approvedInvoice.id));
    expect(approve.status).toBe('approved');
    const approvedTotal = await readInvoiceTotalAmount(request, approvedInvoice.id);

    const heldPoId = await readyOneLine(request, vendorId);
    const heldInvoice = await createReceivedInvoice(request, heldPoId, 'EXP-HELD-NO', [curlLine]);
    const heldMatch = await matchInvoice(request, heldInvoice.id);
    expect(heldMatch.status).toBe('matched');
    expect(heldMatch.matched).toBe(true);

    const exposure = await readExposure(request, vendorId);
    expect(exposure.vendor_id).toBe(vendorId);
    expect(exposure.open_ap_liability).toBe(approvedTotal);
    expect(exposure.approved_invoices).toEqual([approvedInvoice.id]);
    expect(exposure.approved_invoices).not.toContain(heldInvoice.id);
  });

  test('EXP-07 reads exposure separately for each vendor', apiTag, async ({ request }) => {
    const northVendorId = await createVendor(request, 'Exposure North Supply');
    const southVendorId = await createVendor(request, 'Exposure South Supply');

    const northPoId = await readyOneLine(request, northVendorId);
    const northInvoice = await createReceivedInvoice(request, northPoId, 'EXP-NORTH', [curlLine]);
    const northMatch = await matchInvoice(request, northInvoice.id);
    expect(northMatch.status).toBe('matched');
    expect(northMatch.matched).toBe(true);
    const northApprove = await readApprove(request, await postApprove(request, northInvoice.id));
    expect(northApprove.status).toBe('approved');

    const southPoId = await readyOneLine(request, southVendorId);
    const southInvoice = await createReceivedInvoice(request, southPoId, 'EXP-SOUTH', [curlLine]);
    const southMatch = await matchInvoice(request, southInvoice.id);
    expect(southMatch.status).toBe('matched');
    expect(southMatch.matched).toBe(true);
    const southApprove = await readApprove(request, await postApprove(request, southInvoice.id));
    expect(southApprove.status).toBe('approved');

    const northTotal = await readInvoiceTotalAmount(request, northInvoice.id);
    const southTotal = await readInvoiceTotalAmount(request, southInvoice.id);

    const northExposure = await readExposure(request, northVendorId);
    const southExposure = await readExposure(request, southVendorId);
    expect(northExposure.vendor_id).toBe(northVendorId);
    expect(southExposure.vendor_id).toBe(southVendorId);
    expect(northExposure.open_ap_liability).toBe(northTotal);
    expect(southExposure.open_ap_liability).toBe(southTotal);
    expect(northExposure.approved_invoices).toEqual([northInvoice.id]);
    expect(southExposure.approved_invoices).toEqual([southInvoice.id]);
  });

  test('EXP-08 returns the same exposure on a repeated read', apiTag, async ({ request }) => {
    const vendorId = await createVendor(request, 'Exposure Reread Supply');
    const poId = await readyOneLine(request, vendorId);
    const invoice = await createReceivedInvoice(request, poId, 'EXP-REREAD', [curlLine]);
    await matchInvoice(request, invoice.id);
    const approve = await readApprove(request, await postApprove(request, invoice.id));
    expect(approve.status).toBe('approved');

    const first = await readExposure(request, vendorId);
    const second = await readExposure(request, vendorId);
    expect(second.vendor_id).toBe(first.vendor_id);
    expect(second.open_ap_liability).toBe(first.open_ap_liability);
    expect(second.approved_invoices).toEqual(first.approved_invoices);
  });

  test('EXP-09 returns 404 for an unknown vendor', apiTag, async ({ request }) => {
    const response = await request.get('/vendors/vnd-does-not-exist/exposure');
    await expectRuleAbsent(request, response);
  });
});
