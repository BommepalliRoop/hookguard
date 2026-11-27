import { describe, expect, it } from 'vitest';
import { createPrng } from '../src/index.js';
import { retryDelayMs, serverDelayMs } from '../src/retry.js';

const base = { backoffMs: 1250 };
const now = Date.UTC(2026, 2, 14, 12);
function unusedRandom(): never {
  throw new Error('Unexpected jitter draw');
}

describe('retryDelayMs', () => {
  it('uses the configured delay for absent or shorter Retry-After values', () => {
    expect(retryDelayMs(base, unusedRandom)).toBe(1250);
    expect(retryDelayMs(base, unusedRandom, '1', now)).toBe(1250);
    expect(retryDelayMs(base, unusedRandom, '0', now)).toBe(1250);
  });

  it('honors seconds and canonical IMF-fixdate values', () => {
    expect(retryDelayMs(base, unusedRandom, '  5\t', now)).toBe(5000);
    expect(
      retryDelayMs(base, unusedRandom, new Date(now + 4500).toUTCString(), now),
    ).toBe(4000);
    expect(
      retryDelayMs(
        base,
        unusedRandom,
        new Date(now - 30_000).toUTCString(),
        now,
      ),
    ).toBe(1250);
    expect(
      retryDelayMs(
        { backoffMs: 0 },
        unusedRandom,
        new Date(now + 1000).toUTCString(),
        now + 999.8,
      ),
    ).toBe(1);
  });

  it('accepts both legacy HTTP-date formats using UTC', () => {
    const wednesday = Date.UTC(2026, 2, 18, 12);
    expect(serverDelayMs('Wednesday, 18-Mar-26 12:00:05 GMT', wednesday)).toBe(
      5000,
    );
    expect(
      serverDelayMs('Wednesday, 31-Feb-26 12:00:05 GMT', wednesday),
    ).toBeUndefined();
    expect(
      retryDelayMs(base, unusedRandom, 'Saturday, 14-Mar-26 12:00:05 GMT', now),
    ).toBe(5000);
    expect(
      retryDelayMs(base, unusedRandom, 'Sat Mar 14 12:00:05 2026', now),
    ).toBe(5000);
    expect(
      retryDelayMs(
        base,
        unusedRandom,
        'Sun Mar  1 12:00:05 2026',
        Date.UTC(2026, 2, 1, 12),
      ),
    ).toBe(5000);
  });

  it('resolves two-digit years against the injected time', () => {
    expect(
      retryDelayMs(
        base,
        unusedRandom,
        'Friday, 01-Jan-00 00:00:00 GMT',
        Date.UTC(2099, 11, 31, 23, 59, 55),
      ),
    ).toBe(5000);
    expect(
      retryDelayMs(base, unusedRandom, 'Sunday, 01-Jan-62 00:00:00 GMT', now),
    ).toBe(60_000);
    expect(
      retryDelayMs(base, unusedRandom, 'Saturday, 01-Jan-77 00:00:00 GMT', now),
    ).toBe(1250);
  });

  it('accepts an HTTP date with a leap second', () => {
    expect(
      retryDelayMs(
        base,
        unusedRandom,
        'Sat, 31 Dec 2016 23:59:60 GMT',
        Date.UTC(2016, 11, 31, 23, 59, 55),
      ),
    ).toBe(5000);
  });

  it.each([
    '-10',
    '+10',
    '0.001',
    '1e3',
    '2, 3',
    '1\n2',
    '\n10',
    'Sat Mar  14 12:00:05 2026',
    'Sat Mar 14 12:00:05 2026 UTC',
    'Friday, 14-Mar-26 12:00:05 GMT',
    'Fri, 14 Mar 2026 12:00:05 GMT',
    '2026-03-14T12:00:05.000Z',
  ])('falls back to the policy for malformed Retry-After %s', (header) => {
    expect(retryDelayMs(base, unusedRandom, header, now)).toBe(1250);
  });

  it('caps numeric headers, HTTP dates, and configured delays at sixty seconds', () => {
    expect(retryDelayMs(base, unusedRandom, '9'.repeat(400), now)).toBe(60_000);
    expect(
      retryDelayMs(
        base,
        unusedRandom,
        new Date(now + 60_001_000).toUTCString(),
        now,
      ),
    ).toBe(60_000);
    expect(retryDelayMs({ backoffMs: 60_123 }, unusedRandom)).toBe(60_000);
    expect(retryDelayMs({ backoffMs: 59_999, jitterMs: 7 }, () => 0.99)).toBe(
      60_000,
    );
  });

  it('draws repeatable positive jitter bounded by the configured jitter and respects a longer server delay', () => {
    const policy = { backoffMs: 100, jitterMs: 100 };
    const streamA = createPrng(42);
    const streamB = createPrng(42);
    const times = [160, 145, 186, 167, 117];
    expect(times.map(() => retryDelayMs(policy, streamA))).toEqual(times);
    expect(times.map(() => retryDelayMs(policy, streamB))).toEqual(times);
    expect(retryDelayMs(policy, () => 0)).toBe(100);
    expect(retryDelayMs(policy, () => 0.999)).toBe(200);
    expect(retryDelayMs(policy, () => 0.999, '1')).toBe(1000);
  });

  it('rejects invalid timing inputs with bounded, value-free diagnostics', () => {
    expect(() => retryDelayMs({ backoffMs: -1 }, unusedRandom)).toThrow(
      RangeError,
    );
    expect(() =>
      retryDelayMs({ backoffMs: 1, jitterMs: 1.1 }, unusedRandom),
    ).toThrow(RangeError);
    expect(() => retryDelayMs(base, unusedRandom, '1', Number.NaN)).toThrow(
      RangeError,
    );
    expect(() => retryDelayMs({ ...base, jitterMs: 1 }, () => 1)).toThrow(
      RangeError,
    );
  });
});
