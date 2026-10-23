import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { expectSchema } from './helpers/schema';

const apiTag = { tag: '@api' };

interface VendorBody {
  id: string;
  name: string;
  active: boolean;
}

interface SkuBody {
  sku: string;
  description: string;
  unit_price: number;
}

const seedVendors: VendorBody[] = [
  { id: 'vnd-001', name: 'Maple Ridge Supply', active: true },
  { id: 'vnd-002', name: 'Old Quarry Materials', active: false },
];

const seedSkus: SkuBody[] = [
  { sku: 'LUM-2X4-8', description: '2x4 stud, 8 ft', unit_price: 4.75 },
  { sku: 'PLY-12-4X8', description: 'Plywood sheet, 1/2 in, 4x8 ft', unit_price: 22.4 },
  { sku: 'CEM-30KG', description: 'Cement bag, 30 kg', unit_price: 11.9 },
  { sku: 'REB-10MM-6', description: 'Rebar, 10 mm, 6 m', unit_price: 18.25 },
  { sku: 'SCR-DECK-1LB', description: 'Deck screws, 1 lb box', unit_price: 9.99 },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVendorBody(value: unknown): value is VendorBody {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.active === 'boolean'
  );
}

function isSkuBody(value: unknown): value is SkuBody {
  return (
    isRecord(value) &&
    typeof value.sku === 'string' &&
    typeof value.description === 'string' &&
    typeof value.unit_price === 'number'
  );
}

function isErrorBody(value: unknown): value is { detail: string; rule?: unknown } {
  return isRecord(value) && typeof value.detail === 'string';
}

async function resetApi(request: APIRequestContext): Promise<void> {
  const response = await request.post('/admin/reset');
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Reset');
  if (!isRecord(body)) {
    throw new Error('POST /admin/reset did not return an object');
  }
  expect(body.status).toBe('reset');
}

async function readVendors(request: APIRequestContext): Promise<VendorBody[]> {
  const response = await request.get('/vendors');
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  expect(Array.isArray(body)).toBe(true);
  if (!Array.isArray(body)) {
    throw new Error('GET /vendors did not return an array');
  }

  const vendors: VendorBody[] = [];
  for (const item of body) {
    await expectSchema(request, item, 'Vendor');
    if (!isVendorBody(item)) {
      throw new Error('GET /vendors item did not match Vendor');
    }
    vendors.push(item);
  }
  return vendors;
}

async function readSkus(request: APIRequestContext): Promise<SkuBody[]> {
  const response = await request.get('/skus');
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  expect(Array.isArray(body)).toBe(true);
  if (!Array.isArray(body)) {
    throw new Error('GET /skus did not return an array');
  }

  const skus: SkuBody[] = [];
  for (const item of body) {
    await expectSchema(request, item, 'Sku');
    if (!isSkuBody(item)) {
      throw new Error('GET /skus item did not match Sku');
    }
    skus.push(item);
  }
  return skus;
}

async function readCreatedVendor(request: APIRequestContext, response: APIResponse): Promise<VendorBody> {
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Vendor');
  if (!isVendorBody(body)) {
    throw new Error('POST /vendors did not return a Vendor');
  }
  return body;
}

function expectSeedVendorsOnly(vendors: VendorBody[]): void {
  expect(vendors.map((vendor) => vendor.id).sort()).toEqual(['vnd-001', 'vnd-002']);
  for (const seed of seedVendors) {
    const match = vendors.find((vendor) => vendor.id === seed.id);
    expect(match?.name).toBe(seed.name);
    expect(match?.active).toBe(seed.active);
  }
}

function expectCatalog(skus: SkuBody[]): void {
  expect(skus.map((item) => item.sku).sort()).toEqual(seedSkus.map((item) => item.sku).sort());
  for (const seed of seedSkus) {
    const match = skus.find((item) => item.sku === seed.sku);
    expect(match?.description).toBe(seed.description);
    expect(match?.unit_price).toBe(seed.unit_price);
  }
}

function expectCreatedVendor(vendor: VendorBody, name: string, active: boolean): void {
  expect(vendor.name).toBe(name);
  expect(vendor.active).toBe(active);
  expect(vendor.id.startsWith('vnd-')).toBe(true);
}

async function expectValidationError(request: APIRequestContext, response: APIResponse): Promise<void> {
  expect(response.status()).toBe(400);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
  if (!isErrorBody(body)) {
    throw new Error('POST /vendors error body did not include detail');
  }
  expect(Object.prototype.hasOwnProperty.call(body, 'detail')).toBe(true);
  expect(body.rule).toBe('validation_error');
}

test.describe('vendors and catalog', () => {
  test.describe.configure({ mode: 'serial' });

  test('VLIST-01 lists the two seed vendors', apiTag, async ({ request }) => {
    await resetApi(request);

    const vendors = await readVendors(request);

    expectSeedVendorsOnly(vendors);
  });

  test('VLIST-02 lists the created vendor with the seed vendors', apiTag, async ({ request }) => {
    await resetApi(request);
    const createdResponse = await request.post('/vendors', {
      data: { name: 'Cedar Point Hardware' },
    });
    expect(createdResponse.status()).toBe(201);
    const created = await readCreatedVendor(request, createdResponse);
    expectCreatedVendor(created, 'Cedar Point Hardware', true);

    const vendors = await readVendors(request);

    expect(vendors.map((vendor) => vendor.id).sort()).toEqual(
      ['vnd-001', 'vnd-002', created.id].sort(),
    );
    for (const seed of seedVendors) {
      const match = vendors.find((vendor) => vendor.id === seed.id);
      expect(match?.name).toBe(seed.name);
      expect(match?.active).toBe(seed.active);
    }
    const listed = vendors.find((vendor) => vendor.id === created.id);
    expect(listed).toBeDefined();
    expect(listed?.name).toBe('Cedar Point Hardware');
    expect(listed?.active).toBe(true);
    expect(listed?.id.startsWith('vnd-')).toBe(true);
  });

  test('VLIST-03 lists only the seed vendors after reset', apiTag, async ({ request }) => {
    await resetApi(request);
    const createdResponse = await request.post('/vendors', {
      data: { name: 'Cedar Point Hardware' },
    });
    expect(createdResponse.status()).toBe(201);
    const created = await readCreatedVendor(request, createdResponse);
    expectCreatedVendor(created, 'Cedar Point Hardware', true);

    await resetApi(request);
    const vendors = await readVendors(request);

    expectSeedVendorsOnly(vendors);
    expect(vendors.find((vendor) => vendor.id === created.id)).toBeUndefined();
  });

  test('VLIST-04 returns the same vendor ids on a repeated read', apiTag, async ({ request }) => {
    await resetApi(request);

    const first = await readVendors(request);
    const second = await readVendors(request);

    expect(first.map((vendor) => vendor.id).sort()).toEqual(second.map((vendor) => vendor.id).sort());
  });

  test('VND-01 creates a vendor when active is omitted', apiTag, async ({ request }) => {
    await resetApi(request);
    const response = await request.post('/vendors', {
      data: { name: 'Cedar Point Hardware' },
    });

    expect(response.status()).toBe(201);
    const vendor = await readCreatedVendor(request, response);
    expectCreatedVendor(vendor, 'Cedar Point Hardware', true);
  });

  test('VND-02 creates an active vendor', apiTag, async ({ request }) => {
    await resetApi(request);
    const response = await request.post('/vendors', {
      data: { name: 'Cedar Point Hardware', active: true },
    });

    expect(response.status()).toBe(201);
    const vendor = await readCreatedVendor(request, response);
    expectCreatedVendor(vendor, 'Cedar Point Hardware', true);
  });

  test('VND-03 creates an inactive vendor', apiTag, async ({ request }) => {
    await resetApi(request);
    const response = await request.post('/vendors', {
      data: { name: 'Cedar Point Hardware', active: false },
    });

    expect(response.status()).toBe(201);
    const vendor = await readCreatedVendor(request, response);
    expectCreatedVendor(vendor, 'Cedar Point Hardware', false);
  });

  test('VND-04 creates a vendor with a one-character name', apiTag, async ({ request }) => {
    await resetApi(request);
    const response = await request.post('/vendors', {
      data: { name: 'A' },
    });

    expect(response.status()).toBe(201);
    const vendor = await readCreatedVendor(request, response);
    expectCreatedVendor(vendor, 'A', true);
  });

  test('VND-05 rejects a body with no name', apiTag, async ({ request }) => {
    await resetApi(request);
    const response = await request.post('/vendors', {
      data: { active: true },
    });

    await expectValidationError(request, response);
  });

  test('VND-06 rejects an empty name', apiTag, async ({ request }) => {
    await resetApi(request);
    const response = await request.post('/vendors', {
      data: { name: '' },
    });

    await expectValidationError(request, response);
  });

  test('VND-07 rejects a non-string name', apiTag, async ({ request }) => {
    await resetApi(request);
    const response = await request.post('/vendors', {
      data: { name: 1 },
    });

    await expectValidationError(request, response);
  });

  test('VND-08 rejects a non-boolean active', apiTag, async ({ request }) => {
    await resetApi(request);
    const response = await request.post('/vendors', {
      data: { name: 'Cedar Point Hardware', active: 'true' },
    });

    await expectValidationError(request, response);
  });

  test('VND-09 rejects an array body', apiTag, async ({ request }) => {
    await resetApi(request);
    const response = await request.post('/vendors', {
      data: [],
    });

    await expectValidationError(request, response);
  });

  test('SKU-01 lists the five seed catalog rows', apiTag, async ({ request }) => {
    await resetApi(request);

    const skus = await readSkus(request);

    expectCatalog(skus);
  });

  test('SKU-02 returns the same sku values on a repeated read', apiTag, async ({ request }) => {
    await resetApi(request);

    const first = await readSkus(request);
    const second = await readSkus(request);

    expect(first).toHaveLength(5);
    expect(second).toHaveLength(5);
    expect(first.map((item) => item.sku).sort()).toEqual(second.map((item) => item.sku).sort());
  });

  test('SKU-03 leaves the catalog unchanged after vendor create', apiTag, async ({ request }) => {
    await resetApi(request);
    const createdResponse = await request.post('/vendors', {
      data: { name: 'Cedar Point Hardware' },
    });
    expect(createdResponse.status()).toBe(201);
    const created = await readCreatedVendor(request, createdResponse);
    expectCreatedVendor(created, 'Cedar Point Hardware', true);

    const skus = await readSkus(request);

    expectCatalog(skus);
  });
});
