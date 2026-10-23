import { expect, test } from '@playwright/test';
import { expectSchema } from './helpers/schema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test('GET /skus matches Sku', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/skus');
  expect(response.status()).toBe(200);

  const body: unknown = await response.json();
  expect(Array.isArray(body)).toBe(true);
  if (!Array.isArray(body)) {
    return;
  }

  expect(body.length).toBeGreaterThan(0);
  for (const sku of body) {
    await expectSchema(request, sku, 'Sku');
  }
});

test('GET /vendors matches Vendor', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/vendors');
  expect(response.status()).toBe(200);

  const body: unknown = await response.json();
  expect(Array.isArray(body)).toBe(true);
  if (!Array.isArray(body)) {
    return;
  }

  expect(body.length).toBeGreaterThan(0);
  for (const vendor of body) {
    await expectSchema(request, vendor, 'Vendor');
  }
});

test('Vendor schema rejects a vendor without active', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/vendors');
  expect(response.status()).toBe(200);

  const body: unknown = await response.json();
  expect(Array.isArray(body)).toBe(true);
  if (!Array.isArray(body)) {
    return;
  }

  expect(body.length).toBeGreaterThan(0);
  const vendor = body[0];
  expect(isRecord(vendor)).toBe(true);
  if (!isRecord(vendor)) {
    return;
  }

  expect(Object.prototype.hasOwnProperty.call(vendor, 'active')).toBe(true);
  const invalidVendor: Record<string, unknown> = { ...vendor };
  delete invalidVendor.active;

  await expect(expectSchema(request, invalidVendor, 'Vendor')).rejects.toThrow();
});

test('expectSchema rejects an unknown schema name', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/vendors');
  expect(response.status()).toBe(200);

  const body: unknown = await response.json();
  expect(Array.isArray(body)).toBe(true);
  if (!Array.isArray(body)) {
    return;
  }

  expect(body.length).toBeGreaterThan(0);
  const validBody = body[0];

  await expect(expectSchema(request, validBody, 'NonexistentSchema')).rejects.toThrow(
    /NonexistentSchema/,
  );
});
