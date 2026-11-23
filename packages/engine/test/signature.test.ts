import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signingHeaders, verifySignedPayload } from '../src/signature.js';

const nowSeconds = 1700000000;
const key = 'synthetic-test-key';
const body = Buffer.from('00ff7b0d0a7d', 'hex');
const signature = 'x-hookguard-signature';
const timestamp = 'x-hookguard-timestamp';
const headers = {
  [signature]:
    '044c4f12c074fa22de765af422ccb07e716b9685007d5397f76e4e440115bd8d',
  [timestamp]: '1700000000',
};

describe('signed payloads', () => {
  it('signs timestamp, period, and exact bytes including non-UTF-8 data', () => {
    expect(signingHeaders(body, key, { nowSeconds })).toEqual(headers);
    expect(verifySignedPayload(body, key, headers, { nowSeconds })).toBe(true);
    expect(
      verifySignedPayload(body.subarray(1), key, headers, { nowSeconds }),
    ).toBe(false);
    expect(
      verifySignedPayload(body, 'synthetic-other-key', headers, { nowSeconds }),
    ).toBe(false);
    expect(
      verifySignedPayload(
        body,
        key,
        { ...headers, [timestamp]: String(nowSeconds + 1) },
        { nowSeconds },
      ),
    ).toBe(false);
  });

  it('produces a well-formed incorrect HMAC', () => {
    const invalid = signingHeaders(body, key, { mode: 'invalid', nowSeconds });
    expect(invalid[signature]).toMatch(/^[0-9a-f]{64}$/);
    expect(verifySignedPayload(body, key, invalid, { nowSeconds })).toBe(false);
  });

  it.each(['stale', 'future'] as const)(
    'produces a correctly signed %s fixture outside the configured window',
    (mode) => {
      const fixture = signingHeaders(body, key, {
        mode,
        nowSeconds,
        toleranceSeconds: 3600,
      });
      const signedAt = Number(fixture[timestamp]);
      expect(
        (signedAt - nowSeconds) * (mode === 'stale' ? -1 : 1),
      ).toBeGreaterThanOrEqual(3660);
      expect(
        verifySignedPayload(body, key, fixture, {
          nowSeconds,
          toleranceSeconds: 3600,
        }),
      ).toBe(false);
      expect(
        verifySignedPayload(body, key, fixture, { nowSeconds: signedAt }),
      ).toBe(true);
    },
  );

  it.each([-301, -300, 300, 301])(
    'checks the inclusive default window at offset %i',
    (offset) => {
      expect(
        verifySignedPayload(body, key, headers, {
          nowSeconds: nowSeconds + offset,
        }),
      ).toBe(Math.abs(offset) <= 300);
    },
  );

  it.each([1, 3600])(
    'accepts timestamps on each boundary of a %i second window',
    (toleranceSeconds) => {
      for (const sign of [-1, 1]) {
        for (const extra of [0, 1]) {
          expect(
            verifySignedPayload(body, key, headers, {
              nowSeconds: nowSeconds + sign * (toleranceSeconds + extra),
              toleranceSeconds,
            }),
          ).toBe(extra === 0);
        }
      }
    },
  );

  it.each([
    undefined,
    '',
    '00',
    '0'.repeat(63),
    '0'.repeat(65),
    'z'.repeat(64),
    headers[signature] + ', ' + headers[signature],
    headers[signature] + '\n',
  ])('rejects missing or malformed signature %j', (value) => {
    expect(
      verifySignedPayload(
        body,
        key,
        { ...headers, [signature]: value },
        { nowSeconds },
      ),
    ).toBe(false);
  });

  it.each([
    undefined,
    '',
    '-0',
    '01700000000',
    '1700000000.0',
    '+1700000000',
    '1.7e9',
    '1700000000\n',
    ' 1700000000',
    '1700000000,1700000000',
    '9007199254740992',
  ])('rejects missing or malformed timestamp %j', (value) => {
    const mac = createHmac('sha256', key)
      .update(String(value) + '.')
      .update(body)
      .digest('hex');
    expect(
      verifySignedPayload(
        body,
        key,
        { [signature]: mac, [timestamp]: value },
        { nowSeconds },
      ),
    ).toBe(false);
  });

  it('accepts case-insensitive field names and rejects duplicate fields', () => {
    expect(
      verifySignedPayload(
        body,
        key,
        {
          [signature.toUpperCase()]: headers[signature],
          [timestamp.toUpperCase()]: headers[timestamp],
        },
        { nowSeconds },
      ),
    ).toBe(true);
    expect(
      verifySignedPayload(
        body,
        key,
        { ...headers, [signature.toUpperCase()]: headers[signature] },
        { nowSeconds },
      ),
    ).toBe(false);
  });

  it.each([0, 3601, 1.5, NaN])(
    'rejects invalid window configuration %s',
    (toleranceSeconds) => {
      expect(() => signingHeaders(body, key, { toleranceSeconds })).toThrow(
        RangeError,
      );
      expect(() =>
        verifySignedPayload(body, key, headers, { toleranceSeconds }),
      ).toThrow(RangeError);
    },
  );

  it('requires a secret', () => {
    expect(() => signingHeaders(body, '')).toThrow();
    expect(verifySignedPayload(body, '', headers, { nowSeconds })).toBe(false);
  });
});
