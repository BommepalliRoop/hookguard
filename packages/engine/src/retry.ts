const maxDelayMs = 60_000;
const rfc850Date =
  /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), ([0-9]{2})-([A-Za-z]{3})-([0-9]{2}) ([0-9:]{8}) GMT$/u;
const asctimeDate =
  /^([A-Za-z]{3}) ([A-Za-z]{3}) ( [0-9]|[0-9]{2}) ([0-9:]{8}) ([0-9]{4})$/u;

function canonicalHttpDate(value: string, nowMs: number): string {
  const rfc850 = rfc850Date.exec(value);
  if (rfc850) {
    const [, weekday, day, month, shortYear, time] = rfc850;
    const threshold = new Date(nowMs);
    threshold.setUTCFullYear(threshold.getUTCFullYear() + 50);
    const thresholdYear = threshold.getUTCFullYear();
    let year = Math.floor(thresholdYear / 100) * 100 + Number(shortYear);
    const timestamp = Date.parse(`${day} ${month} ${year} ${time} GMT`);
    if (year > thresholdYear || timestamp > threshold.getTime()) year -= 100;
    return `${weekday?.slice(0, 3)}, ${day} ${month} ${year} ${time} GMT`;
  }

  const asctime = asctimeDate.exec(value);
  if (asctime) {
    const [, weekday, month, day, time, year] = asctime;
    return `${weekday}, ${day?.trim().padStart(2, '0')} ${month} ${year} ${time} GMT`;
  }
  return value;
}

export function serverDelayMs(
  header: string | undefined,
  nowMs: number,
): number | undefined {
  const value = header?.replace(/^[ \t]+|[ \t]+$/gu, '');
  if (!value) return undefined;
  if (/^[0-9]+$/u.test(value)) return Number(value) * 1000;

  const canonical = canonicalHttpDate(value, nowMs);
  const normalized = canonical.replace(/:60 GMT$/u, ':59 GMT');
  const timestamp = Date.parse(normalized);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toUTCString() !== normalized
  ) {
    return undefined;
  }
  const leapSecondMs = normalized === canonical ? 0 : 1000;
  return Math.max(0, Math.ceil(timestamp + leapSecondMs - nowMs));
}

/** Computes bounded retry timing, respecting both policy and the receiver's delay. */
export function retryDelayMs(
  policy: {
    readonly backoffMs: number;
    readonly jitterMs?: number | undefined;
  },
  random: () => number,
  retryAfter?: string,
  nowMs = Date.now(),
): number {
  const jitter = policy.jitterMs ?? 0;
  if (
    !Number.isSafeInteger(policy.backoffMs) ||
    policy.backoffMs < 0 ||
    !Number.isSafeInteger(jitter) ||
    jitter < 0 ||
    !Number.isFinite(nowMs)
  ) {
    throw new RangeError('Retry delay inputs are out of range.');
  }
  const sample = jitter > 0 ? random() : 0;
  if (!(sample >= 0 && sample < 1)) {
    throw new RangeError('Retry jitter requires a random value in [0, 1).');
  }
  const localDelay = policy.backoffMs + Math.floor(sample * (jitter + 1));
  return Math.min(
    maxDelayMs,
    Math.max(localDelay, serverDelayMs(retryAfter, nowMs) ?? 0),
  );
}
