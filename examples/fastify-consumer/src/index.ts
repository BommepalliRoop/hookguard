import fastify, {
  type FastifyInstance,
  type RouteHandlerMethod,
} from 'fastify';

type ConsumerMode = 'buggy' | 'fixed';

type ConsumerOptions = {
  mode: ConsumerMode;
  failFirst?: number;
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

export function createFastifyConsumer({
  mode,
  failFirst = 0,
}: ConsumerOptions): FastifyInstance {
  if (!Number.isSafeInteger(failFirst) || failFirst < 0) {
    throw new RangeError('failFirst must be a nonnegative safe integer');
  }

  const app = fastify({ bodyLimit: 64 * 1024 });
  const seenEvents = new Set<string>();
  const orderCredits = new Map<string, number>();
  let remainingFailures = failFirst;

  app.setErrorHandler((error, _request, reply) => {
    const status = isRecord(error) ? error.statusCode : undefined;
    if (status === 400 || status === 413 || status === 415) {
      return reply.code(400).send({ error: 'invalid_payment' });
    }
    return reply.code(500).send({ error: 'internal_error' });
  });

  const acceptPayment: RouteHandlerMethod = (request, reply) => {
    const payment = readPayment(request.body);
    if (!payment) {
      return reply.code(400).send({ error: 'invalid_payment' });
    }
    if (remainingFailures > 0) {
      remainingFailures -= 1;
      return reply.code(503).send({ error: 'demo_unavailable' });
    }

    const { eventId, orderId } = payment;
    if (mode === 'buggy' || !seenEvents.has(eventId)) {
      orderCredits.set(orderId, (orderCredits.get(orderId) ?? 0) + 1);
      if (mode === 'fixed') seenEvents.add(eventId);
    }
    return reply.code(200).send({ accepted: true });
  };
  app.post('/webhook', acceptPayment);
  app.post('/', acceptPayment);

  app.get('/_test/state', (_request, reply) => {
    const orders = Object.fromEntries(
      Array.from(orderCredits, ([orderId, creditsApplied]) => [
        orderId,
        { creditsApplied },
      ]),
    );
    return reply.header('Cache-Control', 'no-store').send({ orders });
  });

  return app;
}
