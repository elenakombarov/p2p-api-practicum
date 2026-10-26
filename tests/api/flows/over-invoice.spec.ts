import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { expectSchema } from '../helpers/schema';

const e2e = { tag: '@e2e' };

const orderedQuantity = 10;
const unitPrice = 4.75;

interface ExposureBody {
  vendor_id: string;
  open_ap_liability: number;
  approved_invoices: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function requireId(id: string, label: string): string {
  if (id.length === 0) {
    throw new Error(`${label} was not created by an earlier step`);
  }
  return id;
}

test.describe('over-invoice flow', () => {
  test.describe.configure({ mode: 'serial' });

  let vendorId = '';
  let poId = '';
  let invoiceId = '';

  test('creates a vendor', e2e, async ({ request }) => {
    const response = await postJson(request, '/vendors', { name: 'Over Invoice Supply' });
    expect(response.status()).toBe(201);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'Vendor');
    if (!isRecord(body) || typeof body.id !== 'string') {
      throw new Error('POST /vendors did not return an id');
    }
    expect(body.id.startsWith('vnd-')).toBe(true);
    expect(body.name).toBe('Over Invoice Supply');
    expect(body.active).toBe(true);
    vendorId = body.id;
  });

  test('creates a purchase order', e2e, async ({ request }) => {
    const response = await postJson(request, '/purchase-orders', {
      vendor_id: requireId(vendorId, 'vendor'),
      line_items: [{ sku: 'LUM-2X4-8', quantity: orderedQuantity, unit_price: unitPrice }],
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
    expect(body.line_items).toEqual([
      expect.objectContaining({ sku: 'LUM-2X4-8', quantity: orderedQuantity, unit_price: unitPrice }),
    ]);
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

  test('receives every ordered unit', e2e, async ({ request }) => {
    const response = await postJson(request, `/purchase-orders/${requireId(poId, 'purchase order')}/receive`, {
      items: [{ sku: 'LUM-2X4-8', quantity: orderedQuantity }],
    });
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'PurchaseOrder');
    if (!isRecord(body) || !Array.isArray(body.line_items)) {
      throw new Error('receive response did not include line items');
    }
    expect(body.id).toBe(poId);
    expect(body.line_items).toEqual([
      expect.objectContaining({ sku: 'LUM-2X4-8', quantity: orderedQuantity }),
    ]);
  });

  test('rejects an invoice for one unit more than received', e2e, async ({ request }) => {
    const response = await postJson(request, '/invoices', {
      po_id: requireId(poId, 'purchase order'),
      invoice_number: 'E2E-OVER',
      line_items: [{ sku: 'LUM-2X4-8', quantity: orderedQuantity + 1, unit_price: unitPrice }],
    });
    expect(response.status()).toBe(400);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'Error');
    if (!isErrorBody(body)) {
      throw new Error('error response did not include detail');
    }
    expect(body.rule).toBe('overpayment_protection');
  });

  test('reports zero exposure after the rejected invoice', e2e, async ({ request }) => {
    const response = await request.get(`/vendors/${requireId(vendorId, 'vendor')}/exposure`);
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    await expectSchema(request, body, 'VendorExposure');
    if (!isExposureBody(body)) {
      throw new Error('exposure response did not match VendorExposure');
    }
    expect(body.vendor_id).toBe(vendorId);
    expect(body.open_ap_liability).toBe(0);
    expect(body.approved_invoices).toEqual([]);
  });

  test('accepts an invoice for the received quantity', e2e, async ({ request }) => {
    const response = await postJson(request, '/invoices', {
      po_id: requireId(poId, 'purchase order'),
      invoice_number: 'E2E-CORRECT',
      line_items: [{ sku: 'LUM-2X4-8', quantity: orderedQuantity, unit_price: unitPrice }],
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
    expect(body.invoice_number).toBe('E2E-CORRECT');
    expect(body.status).toBe('received');
    expect(body.matched).toBe(false);
    expect(body.partial_receipt).toBe(null);
    expect(body.line_items).toEqual([
      expect.objectContaining({ sku: 'LUM-2X4-8', quantity: orderedQuantity, unit_price: unitPrice }),
    ]);
    invoiceId = body.id;
  });

  test('matches the corrected invoice', e2e, async ({ request }) => {
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

  test('approves the corrected invoice', e2e, async ({ request }) => {
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
});
