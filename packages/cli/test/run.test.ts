import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExpressConsumer } from '@hookguard/express-consumer';
import { runResultSchema } from '@hookguard/schema';
import { expect, it, vi } from 'vitest';
import { runCli } from '../src/program.js';

it.each([
  { mode: 'buggy', credits: 3, exit: 1, format: 'text' },
  { mode: 'fixed', credits: 1, exit: 0, format: 'text' },
  { mode: 'buggy', credits: 3, exit: 1, format: 'json' },
  { mode: 'fixed', credits: 1, exit: 0, format: 'junit' },
  { mode: 'buggy', credits: 3, exit: 1, format: 'junit' },
  { mode: 'buggy', credits: 3, exit: 1, format: 'text', redactDetail: true },
] as const)(
  'observes $credits credit(s) when running against the $mode Express consumer in $format output',
  async (testCase) => {
    const { mode, credits, exit, format } = testCase;
    const redactDetail = 'redactDetail' in testCase;
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
      const redact = mode === 'buggy' && format !== 'text';
      const config = join(directory, 'duplicate.yaml');
      await writeFile(join(directory, 'payment.json'), fixture);
      await writeFile(
        config,
        scenario
          .replaceAll('http://127.0.0.1:3000', origin)
          .replace('./fixtures/payment-captured.json', './payment.json')
          .replace(
            'redactPaths: []',
            redactDetail
              ? 'redactPaths: ["$.assertions[2].detail"]'
              : redact
                ? 'redactPaths: [$.orders]'
                : 'redactPaths: []',
          ),
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
            ...(redactDetail ? [] : ['--format', format]),
          ],
          {
            writeOut,
            writeErr,
          },
        ),
      ).toBe(exit);
      expect(writeErr).not.toHaveBeenCalled();
      const report = writeOut.mock.calls.flat().join('');
      if (redact || redactDetail)
        expect(report).not.toContain('Expected 1, observed 3.');
      if (redactDetail) expect(report).toContain('[REDACTED]');
      if (format === 'json') {
        expect(runResultSchema.parse(JSON.parse(report))).toMatchObject({
          passed: false,
          assertions: expect.arrayContaining([
            expect.objectContaining({ kind: 'state_json', passed: false }),
          ]),
        });
      } else if (format === 'junit') {
        expect(report).toContain('<testsuite');
        expect(report).toContain(`failures="${exit}"`);
        expect(report.includes('<failure ')).toBe(exit === 1);
      } else if (!redactDetail) {
        expect(report).toContain(`Expected 1, observed ${credits}.`);
      }
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
