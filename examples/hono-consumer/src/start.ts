import process from 'node:process';
import { serve } from '@hono/node-server';
import { createHonoConsumer } from './index.js';

function readInteger(key: string, fallback: number, max: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^[0-9]+$/u.test(raw) || !Number.isSafeInteger(value) || value > max) {
    throw new Error(`${key} must be an integer from 0 to ${max}`);
  }
  return value;
}

function start(): void {
  const mode = process.env.HOOKGUARD_DEMO_MODE ?? 'fixed';
  if (mode !== 'buggy' && mode !== 'fixed') {
    throw new Error('HOOKGUARD_DEMO_MODE must be buggy or fixed');
  }
  const port = readInteger('HOOKGUARD_DEMO_PORT', 3000, 65_535);
  const failFirst = readInteger(
    'HOOKGUARD_DEMO_FAIL_FIRST',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const hostname = '127.0.0.1';
  const app = createHonoConsumer({ mode, failFirst });
  const server = serve({ fetch: app.fetch, hostname, port }, (address) => {
    process.stdout.write(
      `Hono demo (${mode}) listening on http://${hostname}:${address.port}\n`,
    );
  });
  server.once('error', (error) => {
    process.stderr.write(`Could not start Hono demo. ${error.message}\n`);
    process.exitCode = 1;
  });
}

try {
  start();
} catch (error) {
  process.stderr.write(
    (error instanceof Error ? error.message : 'Could not configure Hono demo') +
      '\n',
  );
  process.exitCode = 1;
}
