import { createServer } from 'node:http';
import { runScenario } from '@hookguard/engine';
import { scenarioSchema } from '@hookguard/schema';
import { expect, test, type TestContext } from 'vitest';
import { createExpressConsumer } from '../src/index.js';

const payment = {
  id: 'evt_payment_001',
  type: 'payment.captured',
  data: { orderId: 'order_123', amountCents: 1200, currency: 'USD' },
};

async function serve(
  onTestFinished: TestContext['onTestFinished'],
  options: Parameters<typeof createExpressConsumer>[0],
): Promise<URL> {
  const server = createServer(createExpressConsumer(options));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  onTestFinished(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing demo listener');
  return new URL('http://127.0.0.1:' + address.port);
}

async function post(
  baseUrl: URL,
  path: string,
  payload: string,
): Promise<number> {
  const response = await fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
  await response.text();
  return response.status;
}

async function readState(baseUrl: URL): Promise<unknown> {
  const response = await fetch(new URL('/_test/state', baseUrl));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  return response.json();
}

test.for([
  ['buggy', 3],
  ['fixed', 1],
] as const)(
  '%s mode records %s credits after three deliveries',
  async ([mode, creditsApplied], { onTestFinished }) => {
    const baseUrl = await serve(onTestFinished, { mode });
    const body = JSON.stringify(payment);
    expect(await post(baseUrl, '/', body)).toBe(200);
    expect(await post(baseUrl, '/webhook', body)).toBe(200);
    expect(await post(baseUrl, '/webhook', body)).toBe(200);
    await expect(readState(baseUrl)).resolves.toEqual({
      orders: { order_123: { creditsApplied } },
    });

    const anotherPayment = JSON.stringify({
      ...payment,
      id: 'evt_payment_002',
    });
    expect(await post(baseUrl, '/webhook', anotherPayment)).toBe(200);
    await expect(readState(baseUrl)).resolves.toEqual({
      orders: { order_123: { creditsApplied: creditsApplied + 1 } },
    });
  },
);

test('rejects malformed and invalid payments without spending simulated failures', async ({
  onTestFinished,
}) => {
  const baseUrl = await serve(onTestFinished, { mode: 'fixed', failFirst: 2 });
  expect(await post(baseUrl, '/webhook', '{')).toBe(400);
  expect(
    await post(
      baseUrl,
      '/webhook',
      JSON.stringify({ ...payment, type: 'unknown' }),
    ),
  ).toBe(400);
  const invalidAmount = {
    ...payment,
    data: { ...payment.data, amountCents: 12.5 },
  };
  expect(await post(baseUrl, '/webhook', JSON.stringify(invalidAmount))).toBe(
    400,
  );

  const body = JSON.stringify(payment);
  expect(await post(baseUrl, '/webhook', body)).toBe(503);
  expect(await post(baseUrl, '/webhook', body)).toBe(503);
  await expect(readState(baseUrl)).resolves.toEqual({ orders: {} });

  expect(await post(baseUrl, '/webhook', body)).toBe(200);
  expect(await post(baseUrl, '/_test/state', body)).toBe(404);
  await expect(readState(baseUrl)).resolves.toEqual({
    orders: { order_123: { creditsApplied: 1 } },
  });
});

test.for([
  ['signed_payload', 200],
  ['bad_signature', 401],
  ['stale_signature', 401],
] as const)(
  'checks the %s scenario against a signed consumer',
  async ([kind, status], { onTestFinished }) => {
    const signingSecret = 'hookguard-synthetic-demo-test';
    const baseUrl = await serve(onTestFinished, {
      mode: 'fixed',
      signingSecret,
    });
    const scenario = scenarioSchema.parse({
      version: 1,
      name: kind,
      scenario: kind,
      fixture: { path: 'synthetic.json', eventIdPath: '$.id' },
      execution: { timeoutMs: 1000 },
      assertions: [{ kind: 'http_status', expected: status }],
      security: { allowTargets: [baseUrl.origin], redactPaths: [] },
    });
    const rawBody = Buffer.from(JSON.stringify(payment, null, 2) + '\n');
    await expect(runScenario(scenario, rawBody, baseUrl.href)).rejects.toThrow(
      'Signature scenarios require HOOKGUARD_SIGNING_SECRET.',
    );
    const result = await runScenario(scenario, rawBody, baseUrl.href, {
      signingSecret,
    });
    expect(result.passed).toBe(true);
    expect(result.attempts.map(({ status }) => status)).toEqual([status]);
    expect(JSON.stringify(result)).not.toContain(signingSecret);
    await expect(readState(baseUrl)).resolves.toEqual({
      orders: status === 200 ? { order_123: { creditsApplied: 1 } } : {},
    });
  },
);

test('signature verification precedes parsing and business state changes', async ({
  onTestFinished,
}) => {
  const signingSecret = 'hookguard-synthetic-demo-test';
  const baseUrl = await serve(onTestFinished, { mode: 'fixed', signingSecret });
  expect(await post(baseUrl, '/webhook', JSON.stringify(payment))).toBe(401);
  await expect(readState(baseUrl)).resolves.toEqual({ orders: {} });
});
