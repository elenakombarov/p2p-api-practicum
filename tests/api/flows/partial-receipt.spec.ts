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

const partialCementQuantity = 2;

interface PurchaseOrderState {
  id: string;
  status: string;
  fully_received: boolean;
  ordered_value: number;
  received_value: number;
}

interface ExposureBody {
  vendor_id: string;
  open_ap_liability: number;
  approved_invoices: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPurchaseOrderState(value: unknown): value is PurchaseOrderState {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.status === 'string' &&
    typeof value.fully_received === 'boolean' &&
    typeof value.ordered_value === 'number' &&
    typeof value.received_value === 'number'
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

function requireId(id: string, label: string): string {
  if (id.length === 0) {
    throw new Error(`${label} was not created by an earlier step`);
  }
  return id;
}

test.describe('partial receipt flow', () => {
  test.describe.configure({ mode: 'serial' });

  let vendorId = '';
  let poId = '';
  let invoiceId = '';
  let orderedValue = Number.NaN;
  let receivedValue = Number.NaN;

  test('creates a vendor', e2e, async ({ request }) => {
    const response = await postJson(request, '/vendors', { name: 'Partial Receipt Supply' });
    expect(response.status()).toBe(201);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'Vendor');
    if (!isRecord(body) || typeof body.id !== 'string') {
      throw new Error('POST /vendors did not return an id');
    }
    expect(body.id.startsWith('vnd-')).toBe(true);
    expect(body.name).toBe('Partial Receipt Supply');
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

  test('receives the first line in full and part of the second', e2e, async ({ request }) => {
    const response = await postJson(request, `/purchase-orders/${requireId(poId, 'purchase order')}/receive`, {
      items: [
        { sku: 'LUM-2X4-8', quantity: lumberLine.quantity },
        { sku: 'CEM-30KG', quantity: partialCementQuantity },
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

  test('leaves the purchase order submitted and not fully received', e2e, async ({ request }) => {
    const response = await request.get(`/purchase-orders/${requireId(poId, 'purchase order')}`);
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'PurchaseOrder');
    if (!isPurchaseOrderState(body)) {
      throw new Error('purchase order response did not include receipt state');
    }
    expect(body.id).toBe(poId);
    expect(body.status).toBe('submitted');
    expect(body.fully_received).toBe(false);
    orderedValue = body.ordered_value;
    receivedValue = body.received_value;
  });

  test('invoices only what was received', e2e, async ({ request }) => {
    const response = await postJson(request, '/invoices', {
      po_id: requireId(poId, 'purchase order'),
      invoice_number: 'E2E-PART',
      line_items: [
        { sku: 'LUM-2X4-8', quantity: lumberLine.quantity, unit_price: lumberLine.unit_price },
        { sku: 'CEM-30KG', quantity: partialCementQuantity, unit_price: cementLine.unit_price },
      ],
    });
    expect(response.status()).toBe(201);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'Invoice');
    if (!isRecord(body) || typeof body.id !== 'string' || !Array.isArray(body.line_items)) {
      throw new Error('POST /invoices did not return an id');
    }
    expect(body.id.startsWith('inv-')).toBe(true);
    expect(body.po_id).toBe(poId);
    expect(body.vendor_id).toBe(vendorId);
    expect(body.invoice_number).toBe('E2E-PART');
    expect(body.status).toBe('received');
    expect(body.matched).toBe(false);
    expect(body.partial_receipt).toBe(null);
    expect(body.line_items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 }),
        expect.objectContaining({ sku: 'CEM-30KG', quantity: partialCementQuantity, unit_price: 11.9 }),
      ]),
    );
    invoiceId = body.id;
  });

  test('matches the invoice with partial_receipt true', e2e, async ({ request }) => {
    test.fail(true, 'BUG-3: partial_receipt stays false when a later line is short');
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
    expect(body.partial_receipt).toBe(true);
  });

  test('approves the matched invoice', e2e, async ({ request }) => {
    const response = await request.post(`/invoices/${requireId(invoiceId, 'invoice')}/approve`);
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'ApproveResult');
    if (!isRecord(body) || typeof body.status !== 'string' || typeof body.invoice_id !== 'string') {
      throw new Error('approve response did not include status');
    }
    expect(body.invoice_id).toBe(invoiceId);
    expect(body.status).toBe('approved');
  });

  test('reports exposure equal to the received value', e2e, async ({ request }) => {
    if (Number.isNaN(orderedValue) || Number.isNaN(receivedValue)) {
      throw new Error('ordered and received values were not returned by an earlier step');
    }
    const response = await request.get(`/vendors/${requireId(vendorId, 'vendor')}/exposure`);
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'VendorExposure');
    if (!isExposureBody(body)) {
      throw new Error('exposure response did not match VendorExposure');
    }
    expect(body.vendor_id).toBe(vendorId);
    expect(receivedValue).not.toBe(orderedValue);
    expect(body.open_ap_liability).toBe(receivedValue);
    expect(body.open_ap_liability).not.toBe(orderedValue);
    expect(body.approved_invoices).toEqual([invoiceId]);
  });
});
