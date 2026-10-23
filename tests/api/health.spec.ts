import { expect, test } from '@playwright/test';

test('GET /health', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});
