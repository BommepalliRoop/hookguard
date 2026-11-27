import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { expect, test, type TestContext } from 'vitest';
import { createFastifyConsumer } from '../src/index.js';

const payment = await readFile(
  new URL('../../scenarios/fixtures/payment-captured.json', import.meta.url),
  'utf8',
);

function createTestApp(
  onTestFinished: TestContext['onTestFinished'],
  options: Parameters<typeof createFastifyConsumer>[0],
): FastifyInstance {
  const app = createFastifyConsumer(options);
  onTestFinished(() => app.close());
  return app;
}

async function post(
  app: FastifyInstance,
  path: string,
  payload: string,
  contentType = 'application/json',
): Promise<{ status: number; body: unknown }> {
  const response = await app.inject({
    method: 'POST',
    url: path,
    headers: { 'content-type': contentType },
    payload,
  });
  return { status: response.statusCode, body: response.json<unknown>() };
}

async function state(app: FastifyInstance): Promise<unknown> {
  const response = await app.inject({ method: 'GET', url: '/_test/state' });
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  return response.json<unknown>();
}

test.for([
  ['buggy', 3],
  ['fixed', 1],
] as const)(
  '%s mode leaves %s credits after three deliveries',
  { timeout: 15_000 },
  async ([mode, creditsApplied], { onTestFinished }) => {
    const app = createTestApp(onTestFinished, { mode });
    for (const path of ['/webhook', '/webhook', '/']) {
      expect(await post(app, path, payment)).toEqual({
        status: 200,
        body: { accepted: true },
      });
    }
    await expect(state(app)).resolves.toEqual({
      orders: { order_123: { creditsApplied } },
    });

    const next = payment.replace('evt_payment_001', 'evt_payment_002');
    expect((await post(app, '/webhook', next)).status).toBe(200);
    await expect(state(app)).resolves.toEqual({
      orders: { order_123: { creditsApplied: creditsApplied + 1 } },
    });
  },
);

test('rejects invalid payments before spending a simulated failure', async ({
  onTestFinished,
}) => {
  const app = createTestApp(onTestFinished, { mode: 'fixed', failFirst: 1 });
  for (const payload of [
    '{',
    '[]',
    payment.replace('1200', '1.5'),
    ' '.repeat(65_537),
  ]) {
    expect(await post(app, '/webhook', payload)).toEqual({
      status: 400,
      body: { error: 'invalid_payment' },
    });
  }
  expect(
    await post(app, '/webhook', payment, 'application/octet-stream'),
  ).toEqual({
    status: 400,
    body: { error: 'invalid_payment' },
  });
  expect(await post(app, '/webhook', payment)).toEqual({
    status: 503,
    body: { error: 'demo_unavailable' },
  });
  await expect(state(app)).resolves.toEqual({ orders: {} });
  expect((await post(app, '/webhook', payment)).status).toBe(200);
  expect((await post(app, '/_test/state', payment)).status).toBe(404);
  await expect(state(app)).resolves.toEqual({
    orders: { order_123: { creditsApplied: 1 } },
  });
});

test('stores state separately for each consumer instance', async ({
  onTestFinished,
}) => {
  const first = createTestApp(onTestFinished, { mode: 'fixed' });
  const second = createTestApp(onTestFinished, { mode: 'fixed' });
  expect((await post(first, '/webhook', payment)).status).toBe(200);
  await expect(state(second)).resolves.toEqual({ orders: {} });
  expect((await post(second, '/webhook', payment)).status).toBe(200);
  await expect(state(second)).resolves.toEqual({
    orders: { order_123: { creditsApplied: 1 } },
  });
});
