import { describe, expect, it } from 'vitest';
import { createPrng, schedule, shuffle } from '../src/index.js';

describe('createPrng', () => {
  it.each([
    [0, [1_144_304_738, 1_416_247, 958_946_056, 627_933_444, 2_007_157_716]],
    [
      42,
      [2_581_720_956, 1_925_393_290, 3_661_312_704, 2_876_485_805, 750_819_978],
    ],
    [
      4_294_967_295,
      [3_850_105_811, 813_802_916, 3_073_704_848, 4_054_706_436, 3_630_262_831],
    ],
  ])('matches the stable 32-bit sequence for seed %s', (seed, words) => {
    const next = createPrng(seed);
    expect(words.map(() => next() * 0x1_0000_0000)).toEqual(words);
  });

  it('produces independent reproducible streams of values in [0, 1)', () => {
    const first = createPrng(7);
    const second = createPrng(7);
    for (let index = 0; index < 100; index += 1) {
      const value = first();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(value).toBe(second());
    }
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 4_294_967_296])(
    'rejects invalid seed %s',
    (seed) => {
      expect(() => createPrng(seed)).toThrow(RangeError);
    },
  );
});

describe('shuffle', () => {
  it('permutes a frozen array reproducibly and keeps the original order intact', () => {
    const input = Object.freeze(['a', 'b', 'c', 'd', 'e']);
    expect(shuffle(input, 42)).toEqual(['a', 'e', 'c', 'b', 'd']);
    expect(shuffle(input, 0)).toEqual(['e', 'c', 'd', 'a', 'b']);
    expect(input).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('preserves repeated values and can return the original order', () => {
    expect(shuffle(['event', 'other', 'event'], 42).sort()).toEqual([
      'event',
      'event',
      'other',
    ]);
    const input = ['a', 'b'];
    const output = shuffle(input, 42);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });

  it('handles short inputs and validates the seed even without swaps', () => {
    expect(shuffle([], 0)).toEqual([]);
    expect(shuffle([undefined], 0)).toEqual([undefined]);
    expect(() => shuffle([], -1)).toThrow(RangeError);
  });
});

describe('schedule', () => {
  it('snapshots order into frozen 1-based steps and preserves event identity', () => {
    const first = { id: 'evt-first' };
    const second = { id: 'evt-second' };
    const input = [first, second, first];
    const steps = schedule(input);

    input.reverse();
    input.splice(0, 1);
    expect(steps).toEqual([
      { sequence: 1, event: first },
      { sequence: 2, event: second },
      { sequence: 3, event: first },
    ]);
    expect(steps[0]?.event).toBe(first);
    expect(steps[2]?.event).toBe(first);
    expect(Object.isFrozen(steps)).toBe(true);
    expect(steps.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(first)).toBe(false);
  });

  it('returns a frozen empty schedule for no events', () => {
    const steps = schedule([]);
    expect(steps).toEqual([]);
    expect(Object.isFrozen(steps)).toBe(true);
  });
});
