import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { expectSchema } from '../helpers/schema';

const e2e = { tag: '@e2e' };

const lumberLine = {
  sku: 'LUM-2X4-8',
  description: '2x4 stud, 8 ft',
  quantity: 10,
  unit_price: 4.75,
};

const cementLine = { sku: 'CEM-30KG', quantity: 4, unit_price: 11.9 };

const invoiceLines = [
  { sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 },
  { sku: 'CEM-30KG', quantity: 4, unit_price: 11.9 },
];

interface GlLine {
  account: string;
  amount: number;
}

interface ApproveBody {
  invoice_id: string;
  status: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGlLine(value: unknown): value is GlLine {
  return isRecord(value) && typeof value.account === 'string' && typeof value.amount === 'number';
}

function isApproveBody(value: unknown): value is ApproveBody {
  return (
    isRecord(value) &&
    typeof value.invoice_id === 'string' &&
    typeof value.status === 'string' &&
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

function postJson(request: APIRequestContext, path: string, data: unknown): Promise<APIResponse> {
  return request.post(path, {
    headers: { 'Content-Type': 'application/json' },
    data,
  });
}

function sumAmounts(lines: GlLine[]): number {
  return lines.reduce((total, line) => total + line.amount, 0);
}

function requireId(id: string, label: string): string {
  if (id.length === 0) {
    throw new Error(`${label} was not created by an earlier step`);
  }
  return id;
}

test.describe('full purchase-to-pay flow', () => {
  test.describe.configure({ mode: 'serial' });

  let vendorId = '';
  let poId = '';
  let invoiceId = '';
  let invoiceTotal = Number.NaN;

  test('creates a vendor', e2e, async ({ request }) => {
    const response = await postJson(request, '/vendors', { name: 'Full Flow Supply' });
    expect(response.status()).toBe(201);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'Vendor');
    if (!isRecord(body) || typeof body.id !== 'string' || typeof body.name !== 'string') {
      throw new Error('POST /vendors did not return an id');
    }
    expect(body.id.startsWith('vnd-')).toBe(true);
    expect(body.name).toBe('Full Flow Supply');
    expect(body.active).toBe(true);
    vendorId = body.id;
  });

  test('creates a purchase order with two lines', e2e, async ({ request }) => {
    const response = await postJson(request, '/purchase-orders', {
      vendor_id: requireId(vendorId, 'vendor'),
      line_items: [lumberLine, cementLine],
    });
    expect(response.status()).toBe(201);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'PurchaseOrder');
    if (!isRecord(body) || typeof body.id !== 'string' || !Array.isArray(body.line_items)) {
      throw new Error('POST /purchase-orders did not return an id');
    }
    expect(body.id.startsWith('po-')).toBe(true);
    expect(body.vendor_id).toBe(vendorId);
    expect(body.status).toBe('draft');
    expect(body.line_items).toHaveLength(2);
    expect(body.line_items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 }),
        expect.objectContaining({ sku: 'CEM-30KG', quantity: 4, unit_price: 11.9 }),
      ]),
    );
    poId = body.id;
  });

  test('submits the purchase order', e2e, async ({ request }) => {
    const response = await request.post(`/purchase-orders/${requireId(poId, 'purchase order')}/submit`);
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'PurchaseOrder');
    if (!isRecord(body) || typeof body.status !== 'string') {
      throw new Error('submit response did not include status');
    }
    expect(body.id).toBe(poId);
    expect(body.status).toBe('submitted');
  });

  test('receives every ordered line', e2e, async ({ request }) => {
    const response = await postJson(request, `/purchase-orders/${requireId(poId, 'purchase order')}/receive`, {
      items: [
        { sku: 'LUM-2X4-8', quantity: 10 },
        { sku: 'CEM-30KG', quantity: 4 },
      ],
    });
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'PurchaseOrder');
    if (!isRecord(body) || !Array.isArray(body.line_items)) {
      throw new Error('receive response did not include line items');
    }
    expect(body.id).toBe(poId);
    expect(body.line_items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sku: 'LUM-2X4-8', quantity: 10 }),
        expect.objectContaining({ sku: 'CEM-30KG', quantity: 4 }),
      ]),
    );
  });

  test('invoices everything that was received', e2e, async ({ request }) => {
    const response = await postJson(request, '/invoices', {
      po_id: requireId(poId, 'purchase order'),
      invoice_number: 'E2E-FULL',
      line_items: invoiceLines,
    });
    expect(response.status()).toBe(201);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'Invoice');
    if (
      !isRecord(body) ||
      typeof body.id !== 'string' ||
      typeof body.total_amount !== 'number' ||
      !Array.isArray(body.line_items)
    ) {
      throw new Error('POST /invoices did not return an id and total_amount');
    }
    expect(body.id.startsWith('inv-')).toBe(true);
    expect(body.po_id).toBe(poId);
    expect(body.vendor_id).toBe(vendorId);
    expect(body.invoice_number).toBe('E2E-FULL');
    expect(body.status).toBe('received');
    expect(body.matched).toBe(false);
    expect(body.partial_receipt).toBe(null);
    expect(body.line_items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 }),
        expect.objectContaining({ sku: 'CEM-30KG', quantity: 4, unit_price: 11.9 }),
      ]),
    );
    invoiceId = body.id;
    invoiceTotal = body.total_amount;
  });

  test('matches the invoice with partial_receipt false', e2e, async ({ request }) => {
    const response = await request.post(`/invoices/${requireId(invoiceId, 'invoice')}/match`);
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'MatchResult');
    if (!isRecord(body) || typeof body.partial_receipt !== 'boolean') {
      throw new Error('match response did not include partial_receipt');
    }
    expect(body.invoice_id).toBe(invoiceId);
    expect(body.po_id).toBe(poId);
    expect(body.status).toBe('matched');
    expect(body.matched).toBe(true);
    expect(body.partial_receipt).toBe(false);
  });

  test('approves a balanced ledger equal to the invoice total', e2e, async ({ request }) => {
    if (Number.isNaN(invoiceTotal)) {
      throw new Error('invoice total was not returned by an earlier step');
    }
    const response = await request.post(`/invoices/${requireId(invoiceId, 'invoice')}/approve`);
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'ApproveResult');
    if (!isApproveBody(body)) {
      throw new Error('approve response did not match ApproveResult');
    }
    expect(body.invoice_id).toBe(invoiceId);
    expect(body.status).toBe('approved');
    expect(body.gl_entry.balanced).toBe(true);
    expect(sumAmounts(body.gl_entry.debits)).toBe(invoiceTotal);
    expect(sumAmounts(body.gl_entry.credits)).toBe(invoiceTotal);
  });

  test('reports exposure equal to the invoice total', e2e, async ({ request }) => {
    if (Number.isNaN(invoiceTotal)) {
      throw new Error('invoice total was not returned by an earlier step');
    }
    const response = await request.get(`/vendors/${requireId(vendorId, 'vendor')}/exposure`);
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'VendorExposure');
    if (!isExposureBody(body)) {
      throw new Error('exposure response did not match VendorExposure');
    }
    expect(body.vendor_id).toBe(vendorId);
    expect(body.open_ap_liability).toBe(invoiceTotal);
    expect(body.approved_invoices).toEqual([invoiceId]);
  });
});
