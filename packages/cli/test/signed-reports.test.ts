import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExpressConsumer } from '@hookguard/express-consumer';
import { runResultSchema } from '@hookguard/schema';
import { expect, it, vi } from 'vitest';
import { runCli } from '../src/program.js';

const secretEnv = 'HOOKGUARD_TEST_SIGNING_SECRET';
const syntheticSecret = 'synthetic-signing-secret-123';

it.each([
  ['valid', 200, { order_123: { creditsApplied: 1 } }],
  ['invalid', 401, {}],
  ['stale', 401, {}],
  ['future', 401, {}],
] as const)(
  'validates signed delivery mode %s and writes sanitized reports',
  async (mode, status, orders) => {
    const directory = await mkdtemp(join(tmpdir(), 'hookguard-signed-'));
    vi.stubEnv(secretEnv, syntheticSecret);
    const server = createExpressConsumer({
      mode: 'fixed',
      signingSecret: syntheticSecret,
    }).listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const config = join(directory, 'scenario.json');
      const json = join(directory, 'result.json');
      const junit = join(directory, 'result.xml');
      await writeFile(
        join(directory, 'event.json'),
        '{"id":"evt_signed","type":"payment.captured","data":{"orderId":"order_123","amountCents":1200,"currency":"USD"}}',
      );
      await writeFile(
        config,
        JSON.stringify({
          version: 1,
          name: 'synthetic signature ' + syntheticSecret,
          scenario: mode === 'valid' ? 'duplicate' : 'bad_signature',
          fixture: { path: 'event.json', eventIdPath: '$.id' },
          execution: { count: 1, timeoutMs: 3000 },
          assertions: [
            { kind: 'http_status', expected: status },
            {
              kind: 'state_json',
              url: origin + '/_test/state',
              jsonPath: '$.orders',
              equals: orders,
            },
          ],
          security: {
            allowTargets: [origin],
            redactPaths: [],
            signature: { secretEnv, mode },
          },
        }),
      );
      const writeOut = vi.fn();
      const writeErr = vi.fn();
      expect(
        await runCli(
          [
            'run',
            '-c',
            config,
            '--target',
            origin,
            '--json',
            json,
            '--junit',
            junit,
          ],
          {
            writeOut,
            writeErr,
          },
        ),
      ).toBe(0);
      expect(writeErr).not.toHaveBeenCalled();
      const result = await readFile(json, 'utf8');
      const suite = await readFile(junit, 'utf8');
      expect(result).not.toContain(syntheticSecret);
      expect(suite).not.toContain(syntheticSecret);
      expect(suite).toContain('<testsuite');
      const parsed = runResultSchema.parse(JSON.parse(result));
      expect(parsed.passed).toBe(true);
      expect(parsed.attempts.map((attempt) => attempt.status)).toEqual([
        status,
      ]);
      expect(JSON.stringify(parsed)).not.toContain('evt_signed');
      expect(
        await runCli(['report', '--input', json], { writeOut, writeErr }),
      ).toBe(0);
      expect(writeOut).toHaveBeenCalledWith(suite);
    } finally {
      vi.unstubAllEnvs();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await rm(directory, { recursive: true });
    }
  },
  15_000,
);
