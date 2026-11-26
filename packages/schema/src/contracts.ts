import { z } from 'zod';

const nonblank = z.string().regex(/\S/u);
// eslint-disable-next-line no-control-regex -- Names and paths may be shown by the CLI.
const name = nonblank.regex(/^[^\u0000-\u001f\u007f-\u009f]+$/u);
const seed = z.int().min(0).max(0xffffffff);
const httpStatus = z.int().min(100).max(599);
const httpUrl = z.url({ protocol: /^https?$/u }).regex(/^https?:\/\//u);
const jsonPath = z
  .string()
  .regex(/^\$(?:\.[A-Za-z0-9_-]+|\[(?:0|[1-9][0-9]*)\])*$/u);
const eventIdPath = jsonPath.min(2);

type JsonValue = z.infer<ReturnType<typeof z.json>>;

function isJsonValue(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  const array = Array.isArray(value);
  if (!array && prototype !== Object.prototype && prototype !== null)
    return false;

  ancestors.add(value);
  const entries: unknown[] = array ? Array.from(value) : Object.values(value);
  const valid = entries.every((entry) => isJsonValue(entry, ancestors));
  ancestors.delete(value);
  return valid;
}

// Validate without Zod's record cloning, which removes an own "__proto__" data key.
const jsonValue = z.custom<JsonValue>((value) => isJsonValue(value));

const assertionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('http_status'),
    expected: z.union([httpStatus, z.array(httpStatus).min(1)]),
  }),
  z.strictObject({
    kind: z.literal('state_json'),
    url: httpUrl,
    jsonPath,
    equals: jsonValue,
  }),
  z.strictObject({
    kind: z.literal('delivery_count'),
    expected: z.int().nonnegative(),
  }),
]);

export const scenarioSchema = z.strictObject({
  version: z.literal(1),
  name,
  scenario: z.enum([
    'duplicate',
    'out_of_order',
    'retry',
    'bad_signature',
    'invalid_payload',
  ]),
  fixture: z.strictObject({ path: name, eventIdPath }),
  seed: seed.optional(),
  execution: z.strictObject({
    count: z.int().min(1).max(100).optional(),
    timeoutMs: z.int().min(1).max(30_000),
    retry: z
      .strictObject({
        maxAttempts: z.int().min(1).max(10),
        backoffMs: z.int().min(0).max(60_000),
        jitterMs: z.int().min(0).max(5_000).optional(),
        statuses: z.array(httpStatus),
      })
      .optional(),
    fail: z.enum(['none', 'timeout', 'http_429', 'http_503']).optional(),
  }),
  assertions: z.array(assertionSchema).min(1).max(32),
  security: z.strictObject({
    allowTargets: z.array(httpUrl).max(32),
    redactPaths: z.array(jsonPath).max(64),
  }),
});

export const runResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  name,
  seed,
  scenarioHash: z.string().regex(/^[a-f0-9]{64}$/u),
  engineVersion: z
    .string()
    .regex(
      /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u,
    ),
  startedAt: z.iso.datetime({ offset: true }),
  attempts: z.array(
    z.strictObject({
      sequence: z.int().nonnegative(),
      status: httpStatus.optional(),
      durationMs: z.number().nonnegative(),
      errorCode: z
        .string()
        .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/u)
        .optional(),
      plannedDelayMs: z.int().nonnegative().optional(),
    }),
  ),
  assertions: z.array(
    z.strictObject({ kind: name, passed: z.boolean(), detail: z.string() }),
  ),
  passed: z.boolean(),
});

export type AssertionV1 = z.infer<typeof assertionSchema>;
export type ScenarioV1 = z.infer<typeof scenarioSchema>;
export type RunResultV1 = z.infer<typeof runResultSchema>;

export const scenarioJsonSchema = z.toJSONSchema(scenarioSchema, {
  io: 'input',
  // JSON Schema instances are already JSON values.
  unrepresentable: ({ zodSchema }) => (zodSchema === jsonValue ? {} : 'throw'),
});
export const runResultJsonSchema = z.toJSONSchema(runResultSchema, {
  io: 'input',
});
