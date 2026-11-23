import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExpressConsumer } from '@hookguard/express-consumer';
import { expect, it, vi } from 'vitest';
import { runCli } from '../src/program.js';

it.each([
  { mode: 'buggy', credits: 3, exit: 1 },
  { mode: 'fixed', credits: 1, exit: 0 },
] as const)(
  'observes $credits credit(s) when running against the $mode Express consumer',
  async ({ mode, credits, exit }) => {
    const directory = await mkdtemp(join(tmpdir(), 'hookguard-express-e2e-'));
    const server = createExpressConsumer({ mode }).listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const source = new URL('../../../examples/scenarios/', import.meta.url);
      const scenario = await readFile(
        new URL('duplicate.yaml', source),
        'utf8',
      );
      const fixture = await readFile(
        new URL('fixtures/payment-captured.json', source),
      );
      const config = join(directory, 'duplicate.yaml');
      await writeFile(join(directory, 'payment.json'), fixture);
      await writeFile(
        config,
        scenario
          .replaceAll('http://127.0.0.1:3000', origin)
          .replace('./fixtures/payment-captured.json', './payment.json'),
      );
      const writeOut = vi.fn();
      const writeErr = vi.fn();
      expect(
        await runCli(['run', '-c', config, '--target', origin], {
          writeOut,
          writeErr,
        }),
      ).toBe(exit);
      expect(writeErr).not.toHaveBeenCalled();
      expect(writeOut.mock.calls.flat().join('')).toContain(
        `Expected 1, observed ${credits}.`,
      );
      const visibleState: unknown = await (
        await fetch(origin + '/_test/state')
      ).json();
      expect(visibleState).toEqual({
        orders: { order_123: { creditsApplied: credits } },
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await rm(directory, { recursive: true });
    }
  },
);
