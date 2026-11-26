import { mkdir, open, rmdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const expressFiles = {
  'hookguard.yaml': `version: 1
name: payment-captured-duplicate
scenario: duplicate
fixture:
  path: ./payment-captured.json
  eventIdPath: $.id
seed: 42
execution:
  count: 3
  timeoutMs: 2000
assertions:
  - kind: http_status
    expected: 200
  - kind: delivery_count
    expected: 3
  - kind: state_json
    url: http://127.0.0.1:3000/_test/state
    jsonPath: $.orders.order_123.creditsApplied
    equals: 1
security:
  allowTargets:
    - http://127.0.0.1:3000
  redactPaths: []
`,
  'payment-captured.json': `{
  "id": "evt_payment_001",
  "type": "payment.captured",
  "data": {
    "orderId": "order_123",
    "amountCents": 1200,
    "currency": "USD"
  }
}
`,
};

export class InitError extends Error {
  override name = 'InitError';
}

export async function initExpressTemplate(directory: string): Promise<void> {
  if (!directory.trim() || /^[\\/]{2}/u.test(directory)) {
    throw new InitError('Choose a new local directory for the template.');
  }

  const destination = resolve(directory);
  try {
    await mkdir(destination, { mode: 0o700 });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new InitError('The template directory already exists.', { cause });
    }
    throw new InitError('Could not create the template directory.', { cause });
  }

  const created: string[] = [];
  try {
    for (const [name, contents] of Object.entries(expressFiles)) {
      const file = join(destination, name);
      const handle = await open(file, 'wx', 0o600);
      created.push(file);
      try {
        await handle.writeFile(contents, 'utf8');
      } finally {
        await handle.close();
      }
    }
  } catch (cause) {
    await Promise.allSettled(created.map((file) => unlink(file)));
    await rmdir(destination).catch(() => {});
    throw new InitError('Could not write the Express template.', { cause });
  }
}
