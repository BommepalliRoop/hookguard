import { createHmac, timingSafeEqual } from 'node:crypto';

export type SignatureMode = 'valid' | 'invalid' | 'stale' | 'future';

interface WindowOptions {
  nowSeconds?: number;
  toleranceSeconds?: number;
}

const timestampHeader = 'x-hookguard-timestamp';
const signatureHeader = 'x-hookguard-signature';

function windowSettings(options: WindowOptions) {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? 300;
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new RangeError('nowSeconds must be a nonnegative safe integer');
  }
  if (!Number.isInteger(tolerance) || tolerance < 1 || tolerance > 3600) {
    throw new RangeError('toleranceSeconds must be an integer from 1 to 3600');
  }
  return { now, tolerance };
}

function digest(payload: Uint8Array, secret: string, timestamp: string) {
  if (secret.length === 0)
    throw new Error('Signing requires a nonempty secret');
  return createHmac('sha256', secret)
    .update(timestamp + '.')
    .update(payload)
    .digest();
}

export function signingHeaders(
  payload: Uint8Array,
  secret: string,
  options: WindowOptions & { mode?: SignatureMode } = {},
): Record<string, string> {
  const { now, tolerance } = windowSettings(options);
  const offset = tolerance + 60;
  let seconds = now;
  if (options.mode === 'stale') seconds -= offset;
  if (options.mode === 'future') seconds += offset;
  if (seconds < 0 || !Number.isSafeInteger(seconds)) {
    throw new RangeError(
      'Fixture timestamp exceeds the supported Unix seconds range',
    );
  }
  const timestamp = String(seconds);
  const mac = digest(payload, secret, timestamp);
  if (options.mode === 'invalid') mac[0] = mac.readUInt8(0) ^ 1;
  return {
    [timestampHeader]: timestamp,
    [signatureHeader]: mac.toString('hex'),
  };
}

function singleHeader(
  headers: Record<string, string | undefined>,
  name: string,
) {
  const matches = Object.keys(headers).filter(
    (key) => key.toLowerCase() === name,
  );
  if (matches.length === 1) return headers[matches[0]!];
}

export function verifySignedPayload(
  payload: Uint8Array,
  secret: string,
  headers: Record<string, string | undefined>,
  options: WindowOptions = {},
): boolean {
  const { now, tolerance } = windowSettings(options);
  const timestamp = singleHeader(headers, timestampHeader);
  const signature = singleHeader(headers, signatureHeader);
  if (
    typeof timestamp !== 'string' ||
    typeof signature !== 'string' ||
    !secret.length
  )
    return false;
  const seconds = Number(timestamp);
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < 0 ||
    String(seconds) !== timestamp
  )
    return false;
  if (Math.abs(now - seconds) > tolerance) return false;
  if (signature.length !== 64 || /[^0-9a-f]/i.test(signature)) return false;
  return timingSafeEqual(
    digest(payload, secret, timestamp),
    Buffer.from(signature, 'hex'),
  );
}
