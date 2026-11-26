import { once } from 'node:events';
import { createServer, type RequestListener } from 'node:http';
import { type AddressInfo } from 'node:net';
import { runResultSchema, scenarioSchema } from '@hookguard/schema';
import { describe, expect, it } from 'vitest';
import { runScenario, scenarioHash } from '../src/run.js';
import { TargetPolicyError } from '../src/transport.js';

const fixture = Buffer.from('{"id":"evt_001","value":1}');

function scenario(origin: string, overrides: Record<string, unknown> = {}) {
  return scenarioSchema.parse({
    version: 1,
    name: 'loopback-test',
    scenario: 'duplicate',
    fixture: { path: 'synthetic.json', eventIdPath: '$.id' },
    execution: { timeoutMs: 1000, count: 2 },
    assertions: [{ kind: 'http_status', expected: 200 }],
    security: { allowTargets: [origin], redactPaths: [] },
    ...overrides,
  });
}

async function serve(
  handler: RequestListener,
  use: (origin: string) => Promise<void>,
) {
  const server = createServer(handler).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('local scenario execution', () => {
  it('reports the retry schedule and asserts the terminal HTTP response', async () => {
    let deliveries = 0;
    await serve(
      (_request, response) => {
        deliveries += 1;
        response.writeHead(deliveries < 3 ? 503 : 200).end();
      },
      async (origin) => {
        const configuration = scenario(origin, {
          scenario: 'retry',
          execution: {
            timeoutMs: 1000,
            retry: { maxAttempts: 3, backoffMs: 1, statuses: [503] },
          },
          assertions: [
            { kind: 'http_status', expected: 200 },
            { kind: 'delivery_count', expected: 3 },
          ],
        });
        const result = await runScenario(configuration, fixture, origin);
        expect(result.passed).toBe(true);
        expect(
          result.attempts.map(({ sequence, status, plannedDelayMs }) => [
            sequence,
            status,
            plannedDelayMs,
          ]),
        ).toEqual([
          [1, 503, 0],
          [2, 503, 1],
          [3, 200, 1],
        ]);
        expect(runResultSchema.parse(result)).toEqual(result);
      },
    );
    expect(deliveries).toBe(3);
  });

  it('records an injected timeout separately from the real request', async () => {
    let deliveries = 0;
    await serve(
      (_request, response) => {
        deliveries += 1;
        response.writeHead(200).end();
      },
      async (origin) => {
        const configuration = scenario(origin, {
          scenario: 'retry',
          execution: {
            timeoutMs: 1000,
            fail: 'timeout',
            retry: { maxAttempts: 2, backoffMs: 0, statuses: [503] },
          },
        });
        const result = await runScenario(configuration, fixture, origin);
        expect(result.passed).toBe(true);
        expect(result.attempts[0]?.errorCode).toBe('simulated_timeout');
        expect(result.attempts[1]?.status).toBe(200);
      },
    );
    expect(deliveries).toBe(1);
  });

  it('fetches a shared state probe once with GET', async () => {
    const methods: (string | undefined)[] = [];
    await serve(
      (request, response) => {
        methods.push(request.method);
        response.writeHead(200).end('{"credits":1,"labels":["synthetic"]}');
      },
      async (origin) => {
        const url = origin + '/state';
        const configuration = scenario(origin, {
          execution: { timeoutMs: 1000, count: 1 },
          assertions: [
            { kind: 'state_json', url, jsonPath: '$.credits', equals: 1 },
            {
              kind: 'state_json',
              url,
              jsonPath: '$.labels[0]',
              equals: 'synthetic',
            },
          ],
        });
        expect((await runScenario(configuration, fixture, origin)).passed).toBe(
          true,
        );
      },
    );
    expect(methods).toEqual(['POST', 'GET']);
  });

  it.each(['$', '$.accounts', '$.accounts[0]', '$.accounts[0].code'])(
    'hides sensitive state values for redaction path %s',
    async (redactPath) => {
      await serve(
        (_request, response) => {
          response.writeHead(200).end(
            JSON.stringify({
              accounts: [
                { code: 9475731234213, token: 'synthetic-probe-token' },
              ],
              accountsTotal: 3,
            }),
          );
        },
        async (origin) => {
          const url = origin + '/state?token=synthetic-url-token';
          const configuration = scenario(origin, {
            assertions: [
              {
                kind: 'state_json',
                url,
                jsonPath: '$.accounts[0].code',
                equals: 9416319474321,
              },
              {
                kind: 'state_json',
                url,
                jsonPath: '$.accountsTotal',
                equals: 1,
              },
              {
                kind: 'state_json',
                url,
                jsonPath: '$.accounts[0].token',
                equals: 'synthetic-probe-token',
              },
            ],
            security: { allowTargets: [origin], redactPaths: [redactPath] },
          });
          const result = await runScenario(
            configuration,
            Buffer.from(
              '{"id":"synthetic-event","token":"synthetic-fixture-token"}',
            ),
            origin,
          );
          expect(result.assertions.map(({ passed }) => passed)).toEqual([
            false,
            false,
            true,
          ]);
          expect(result.assertions[0]?.detail).toBe(
            'State did not match the expected value.',
          );
          expect(result.assertions[1]?.detail).toBe(
            redactPath === '$'
              ? 'State did not match the expected value.'
              : 'Expected 1, observed 3.',
          );
          expect(runResultSchema.parse(result)).toEqual(result);
          const serialized = JSON.stringify(result);
          for (const secret of [
            '9475731234213',
            '9416319474321',
            'synthetic-probe-token',
            'synthetic-url-token',
            'synthetic-fixture-token',
          ]) {
            expect(serialized).not.toContain(secret);
          }
        },
      );
    },
  );

  it('checks all probe targets before sending any deliveries', async () => {
    let attempts = 0;
    await serve(
      (_request, response) => {
        attempts += 1;
        response.end();
      },
      async (origin) => {
        const configuration = scenario(origin, {
          assertions: [
            {
              kind: 'state_json',
              url: 'https://example.invalid/state',
              jsonPath: '$',
              equals: null,
            },
          ],
        });
        await expect(
          runScenario(configuration, fixture, origin),
        ).rejects.toBeInstanceOf(TargetPolicyError);
      },
    );
    expect(attempts).toBe(0);
  });

  it('denies a redirect without visiting the second local path', async () => {
    const paths: (string | undefined)[] = [];
    await serve(
      (request, response) => {
        paths.push(request.url);
        response.writeHead(307, { location: '/second' }).end();
      },
      async (origin) => {
        await expect(
          runScenario(scenario(origin), fixture, origin),
        ).rejects.toBeInstanceOf(TargetPolicyError);
      },
    );
    expect(paths).toEqual(['/']);
  });

  it('hashes a scenario independent of object key order and includes fixture bytes', () => {
    const configuration = scenario('http://127.0.0.1:3000');
    const shuffledKeys = {
      ...Object.fromEntries(Object.entries(configuration).reverse()),
    };
    expect(scenarioHash(configuration, fixture)).toBe(
      scenarioHash(shuffledKeys as typeof configuration, fixture),
    );
    expect(scenarioHash(configuration, fixture)).not.toBe(
      scenarioHash(configuration, Buffer.concat([fixture, Buffer.from('\n')])),
    );
  });
});
