import process from 'node:process';
import { createFastifyConsumer } from './index.js';

function readInteger(key: string, fallback: number, max: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^[0-9]+$/u.test(raw) || !Number.isSafeInteger(value) || value > max) {
    throw new Error(key + ' must be an integer from 0 to ' + max);
  }
  return value;
}

async function start(): Promise<void> {
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
  const app = createFastifyConsumer({ mode, failFirst });
  const address = await app.listen({ host: '127.0.0.1', port });
  process.stdout.write(
    'Fastify demo consumer (' + mode + ') listening on ' + address + '\n',
  );
}

try {
  await start();
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : 'Could not start Fastify demo consumer';
  process.stderr.write(message + '\n');
  process.exitCode = 1;
}
