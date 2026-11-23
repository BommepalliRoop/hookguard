const uint32Range = 0x1_0000_0000;

/** Creates a reproducible Mulberry32 generator for scheduling. */
export function createPrng(seed: number): () => number {
  if (!Number.isInteger(seed) || seed < 0 || seed >= uint32Range) {
    throw new RangeError('seed must be an integer between 0 and 4294967295');
  }

  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / uint32Range;
  };
}

/** Applies seeded Fisher–Yates to a copy of the input. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const random = createPrng(seed);
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    // Fisher–Yates chooses two indices within the copied array.
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex] as T,
      shuffled[index] as T,
    ];
  }
  return shuffled;
}

export interface ScheduledStep<T> {
  readonly sequence: number;
  readonly event: T;
}

/** Freezes the ordered steps and preserves the caller's event references. */
export function schedule<T>(events: readonly T[]): readonly ScheduledStep<T>[] {
  return Object.freeze(
    Array.from(events, (event, index) =>
      Object.freeze({ sequence: index + 1, event }),
    ),
  );
}
