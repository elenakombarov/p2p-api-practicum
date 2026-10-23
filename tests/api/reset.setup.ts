import { expect, test } from '@playwright/test';

test('POST /admin/reset', async ({ request }) => {
  const response = await request.post('/admin/reset');
  expect(response.status()).toBe(200);
});
