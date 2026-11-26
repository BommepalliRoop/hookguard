import { createHmac, timingSafeEqual } from 'node:crypto';

const timestampWindowSeconds = 300;

export function signWebhook(
  body: Uint8Array,
  secret: string,
  timestamp: number,
): string {
  if (!secret.trim() || !Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new RangeError(
      'A signing secret and integer Unix timestamp are required.',
    );
  }
  const digest = createHmac('sha256', secret)
    .update(String(timestamp) + '.')
    .update(body)
    .digest('hex');
  return 'sha256=' + digest;
}

export function verifyWebhook(
  body: Uint8Array,
  secret: string,
  sentAt: string | undefined,
  signature: string | undefined,
  now = Math.floor(Date.now() / 1000),
): boolean {
  if (
    !secret.trim() ||
    sentAt === undefined ||
    !/^(0|[1-9][0-9]{0,15})$/u.test(sentAt) ||
    signature === undefined ||
    !/^sha256=[0-9a-f]{64}$/u.test(signature)
  ) {
    return false;
  }

  const timestamp = Number(sentAt);
  if (
    !Number.isSafeInteger(timestamp) ||
    !Number.isSafeInteger(now) ||
    Math.abs(timestamp - now) > timestampWindowSeconds
  ) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(signWebhook(body, secret, timestamp), 'ascii'),
    Buffer.from(signature, 'ascii'),
  );
}
