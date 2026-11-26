import { verifyWebhook } from '@hookguard/engine';
import express, { type Express } from 'express';

export type ConsumerMode = 'buggy' | 'fixed';

type ConsumerOptions = {
  mode: ConsumerMode;
  failFirst?: number;
  signingSecret?: string | undefined;
};

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

export function createExpressConsumer({
  mode,
  failFirst = 0,
  signingSecret,
}: ConsumerOptions): Express {
  if (!Number.isSafeInteger(failFirst) || failFirst < 0) {
    throw new RangeError('failFirst must be a nonnegative safe integer');
  }

  if (signingSecret !== undefined && !signingSecret.trim()) {
    throw new RangeError('The signing secret must be nonblank.');
  }

  const app = express();
  const bodyOptions = { limit: '64kb', inflate: false };
  const parseBody =
    signingSecret === undefined
      ? express.json(bodyOptions)
      : express.raw({ ...bodyOptions, type: 'application/json' });
  const seenEvents = new Set<string>();
  const orderCredits = new Map<string, number>();
  let remainingFailures = failFirst;

  app.post(
    ['/', '/webhook'],
    (request, response, next) => {
      parseBody(request, response, (error?: unknown) => {
        if (error) {
          response.status(400).json({ error: 'invalid_payment' });
        } else {
          next();
        }
      });
    },
    (request, response) => {
      let body: unknown = request.body;
      if (signingSecret !== undefined) {
        if (
          !Buffer.isBuffer(body) ||
          !verifyWebhook(
            body,
            signingSecret,
            request.get('x-hookguard-timestamp'),
            request.get('x-hookguard-signature'),
          )
        ) {
          response.status(401).json({ error: 'invalid_signature' });
          return;
        }
        try {
          body = JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(body),
          );
        } catch {
          response.status(400).json({ error: 'invalid_payment' });
          return;
        }
      }
      const payment = readPayment(body);
      if (!payment) {
        response.status(400).json({ error: 'invalid_payment' });
        return;
      }
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        response.status(503).json({ error: 'demo_unavailable' });
        return;
      }

      const { eventId, orderId } = payment;
      if (mode === 'buggy' || !seenEvents.has(eventId)) {
        orderCredits.set(orderId, (orderCredits.get(orderId) ?? 0) + 1);
        if (mode === 'fixed') seenEvents.add(eventId);
      }
      response.status(200).json({ accepted: true });
    },
  );

  app.get('/_test/state', (_request, response) => {
    const orders = Object.fromEntries(
      Array.from(orderCredits, ([orderId, creditsApplied]) => [
        orderId,
        { creditsApplied },
      ]),
    );
    response.set('Cache-Control', 'no-store').json({ orders });
  });

  return app;
}
