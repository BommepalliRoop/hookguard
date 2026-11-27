/// <reference lib="dom" preserve="true" />

import { Hono, type Handler } from 'hono';
import { bodyLimit } from 'hono/body-limit';

export type ConsumerMode = 'buggy' | 'fixed';

type ConsumerOptions = {
  mode: ConsumerMode;
  failFirst?: number;
};

const invalidPayment = { error: 'invalid_payment' } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonblank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readPayment(
  value: unknown,
): { eventId: string; orderId: string } | undefined {
  if (
    !isRecord(value) ||
    value.type !== 'payment.captured' ||
    !nonblank(value.id) ||
    !isRecord(value.data)
  ) {
    return undefined;
  }

  const { orderId, amountCents, currency } = value.data;
  if (
    !nonblank(orderId) ||
    typeof amountCents !== 'number' ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    typeof currency !== 'string' ||
    !/^[A-Z]{3}$/u.test(currency)
  ) {
    return undefined;
  }

  return { eventId: value.id, orderId };
}

export function createHonoConsumer({
  mode,
  failFirst = 0,
}: ConsumerOptions): Hono {
  if (!Number.isSafeInteger(failFirst) || failFirst < 0) {
    throw new RangeError('failFirst must be a nonnegative safe integer');
  }

  const app = new Hono();
  const seenEvents = new Set<string>();
  const orderCredits = new Map<string, number>();
  let remainingFailures = failFirst;
  const limitPayment = bodyLimit({
    maxSize: 64 * 1024,
    onError: (context) => context.json(invalidPayment, 400),
  });

  const deliver: Handler = async (context) => {
    const mediaType = context.req.header('content-type')?.split(';', 1)[0];
    const encoding = context.req.header('content-encoding')?.toLowerCase();
    if (
      mediaType?.trim().toLowerCase() !== 'application/json' ||
      (encoding !== undefined && encoding !== 'identity')
    ) {
      return context.json(invalidPayment, 400);
    }

    let body: unknown;
    try {
      body = await context.req.json<unknown>();
    } catch {
      return context.json(invalidPayment, 400);
    }

    const payment = readPayment(body);
    if (!payment) return context.json(invalidPayment, 400);

    if (remainingFailures > 0) {
      remainingFailures -= 1;
      return context.json({ error: 'demo_unavailable' }, 503);
    }

    const { eventId, orderId } = payment;
    if (mode === 'buggy' || !seenEvents.has(eventId)) {
      orderCredits.set(orderId, (orderCredits.get(orderId) ?? 0) + 1);
      if (mode === 'fixed') seenEvents.add(eventId);
    }
    return context.json({ accepted: true });
  };
  app.onError((_error, context) =>
    context.json({ error: 'internal_error' }, 500),
  );
  app.post('/', limitPayment, deliver);
  app.post('/webhook', limitPayment, deliver);

  app.get('/_test/state', (context) => {
    const orders = Object.fromEntries(
      Array.from(orderCredits, ([orderId, creditsApplied]) => [
        orderId,
        { creditsApplied },
      ]),
    );
    context.header('Cache-Control', 'no-store');
    return context.json({ orders });
  });

  return app;
}
