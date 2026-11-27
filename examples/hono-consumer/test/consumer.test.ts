import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { serve } from '@hono/node-server';
import { expect, test, type TestContext } from 'vitest';
import { createHonoConsumer } from '../src/index.js';

const payment = await readFile(
  new URL('../../scenarios/fixtures/payment-captured.json', import.meta.url),
  'utf8',
);

async function listen(
  onTestFinished: TestContext['onTestFinished'],
  options: Parameters<typeof createHonoConsumer>[0],
): Promise<URL> {
  const app = createHonoConsumer(options);
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  onTestFinished(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Missing Hono demo listener');
  }
  return new URL(`http://127.0.0.1:${address.port}`);
}

function post(
  origin: URL,
  body: string,
  path = '/webhook',
  contentType = 'application/json',
): Promise<Response> {
  return fetch(new URL(path, origin), {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });
}

async function state(origin: URL): Promise<unknown> {
  const response = await fetch(new URL('/_test/state', origin));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return response.json();
}

test.for([
  ['buggy', 3],
  ['fixed', 1],
] as const)(
  '%s mode applies %s credit(s) to a repeated event',
  async ([mode, creditsApplied], { onTestFinished }) => {
    const origin = await listen(onTestFinished, { mode });
    const responses = await Promise.all([
      post(origin, payment, '/'),
      post(origin, payment),
      post(origin, payment),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ accepted: true });
    }

    await expect(state(origin)).resolves.toEqual({
      orders: { order_123: { creditsApplied } },
    });
  },
);

test('rejects invalid and oversized inputs before spending transient failures', async ({
  onTestFinished,
}) => {
  const origin = await listen(onTestFinished, { mode: 'fixed', failFirst: 2 });
  const oversized = payment + ' '.repeat(64 * 1024);
  const invalid = [
    await post(origin, '{'),
    await post(origin, '{"id":"evt_wrong","type":"unknown"}'),
    await post(origin, payment, '/webhook', 'text/plain'),
    await post(origin, oversized),
  ];
  for (const response of invalid) {
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_payment',
    });
  }

  // Omitting Content-Length exercises Hono's streaming size check.
  const chunked = await new Promise<{
    status: number | undefined;
    body: string;
  }>((resolve, reject) => {
    const delivery = request(
      new URL('/webhook', origin),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(5_000),
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.once('error', reject);
        response.once('end', () =>
          resolve({ status: response.statusCode, body }),
        );
      },
    );
    delivery.once('error', reject);
    delivery.write(payment);
    delivery.end(' '.repeat(64 * 1024));
  });
  expect(chunked.status).toBe(400);
  expect(JSON.parse(chunked.body)).toEqual({ error: 'invalid_payment' });

  for (let count = 0; count < 2; count += 1) {
    const response = await post(origin, payment);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'demo_unavailable',
    });
  }
  await expect(state(origin)).resolves.toEqual({ orders: {} });

  const success = await post(origin, payment);
  expect(success.status).toBe(200);
  await success.json();
  await expect(state(origin)).resolves.toEqual({
    orders: { order_123: { creditsApplied: 1 } },
  });
});
