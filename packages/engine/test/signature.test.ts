import { expect, it } from 'vitest';
import { signWebhook, verifyWebhook } from '../src/signature.js';

const secret = 'hookguard-synthetic-signing-test';
const timestamp = 1_700_000_000;
const body = Buffer.from('{"id":"synthetic"}\n');

it('verifies a fixed HMAC-SHA256 vector over the timestamp and raw bytes', () => {
  const signature = signWebhook(body, secret, timestamp);
  expect(signature).toBe(
    'sha256=bc15d5f44c77626b6ca27b2a80bd6ed2a1956b2747ecd0e9de9348fb3aa25df4',
  );
  expect(
    verifyWebhook(body, secret, String(timestamp), signature, timestamp),
  ).toBe(true);
  expect(
    verifyWebhook(
      Buffer.from(body.toString().trim()),
      secret,
      String(timestamp),
      signature,
      timestamp,
    ),
  ).toBe(false);
  expect(
    verifyWebhook(
      body,
      'different-synthetic-secret',
      String(timestamp),
      signature,
      timestamp,
    ),
  ).toBe(false);
  expect(
    verifyWebhook(body, secret, String(timestamp + 1), signature, timestamp),
  ).toBe(false);
});

it.each([-301, -300, 300, 301])(
  'checks the timestamp window at %s seconds',
  (offset) => {
    const sentAt = timestamp + offset;
    expect(
      verifyWebhook(
        body,
        secret,
        String(sentAt),
        signWebhook(body, secret, sentAt),
        timestamp,
      ),
    ).toBe(Math.abs(offset) <= 300);
  },
);

it.each([undefined, '', 'sha256=ab', 'sha256=' + 'g'.repeat(64)])(
  'rejects missing or malformed signature %s',
  (signature) => {
    expect(
      verifyWebhook(body, secret, String(timestamp), signature, timestamp),
    ).toBe(false);
  },
);

it.each([undefined, '', '1e9', '01700000000', '9999999999999999'])(
  'rejects missing or malformed timestamp %s',
  (sentAt) => {
    expect(
      verifyWebhook(
        body,
        secret,
        sentAt,
        signWebhook(body, secret, timestamp),
        timestamp,
      ),
    ).toBe(false);
  },
);
