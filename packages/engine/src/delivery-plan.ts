import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { type ScenarioV1 } from '@hookguard/schema';
import { schedule, shuffle, type ScheduledStep } from './primitives.js';

const maxDeliveries = 100;
const jsonPathPattern = /^\$(?:\.[A-Za-z0-9_-]+|\[(?:0|[1-9][0-9]*)\])*$/u;

interface DeliveryScenario {
  readonly scenario: ScenarioV1['scenario'];
  readonly fixture: { readonly eventIdPath: string };
  readonly execution: { readonly count?: number | undefined };
  readonly seed?: number | undefined;
}

export class DeliveryPlanError extends Error {
  override name = 'DeliveryPlanError';
}

/** Resolves the restricted scenario JSONPath grammar using own JSON data only. */
export function lookupJsonPath(value: unknown, path: string): unknown {
  if (!jsonPathPattern.test(path)) return undefined;

  for (const match of path.matchAll(/\.([A-Za-z0-9_-]+)|\[([0-9]+)\]/gu)) {
    const [, property, index] = match;
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) !== (index !== undefined) ||
      (Array.isArray(value) && Number(index) >= value.length)
    ) {
      return undefined;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      value,
      property ?? index ?? '',
    );
    value =
      descriptor && Object.hasOwn(descriptor, 'value')
        ? descriptor.value
        : undefined;
  }
  return value;
}

function parseFixture(fixture: Buffer): unknown {
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(fixture),
    );
  } catch {
    throw new DeliveryPlanError('Fixture must contain valid UTF-8 JSON.');
  }
}

function requireEvent(value: unknown, eventIdPath: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DeliveryPlanError('Fixture events must be JSON objects.');
  }
  const id = lookupJsonPath(value, eventIdPath);
  if (!(
    (typeof id === 'string' && id.trim() !== '') ||
    (typeof id === 'number' && Number.isSafeInteger(id))
  )) {
    throw new DeliveryPlanError(
      'Fixture event ID must be a nonblank string or safe integer.',
    );
  }
}

function permuteEvents(
  value: unknown,
  eventIdPath: string,
  seed = 0,
): Buffer[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > maxDeliveries
  ) {
    throw new DeliveryPlanError(
      'Out-of-order fixture must contain an array of 1 to 100 events.',
    );
  }
  const bodies = value.map((event: unknown) => {
    requireEvent(event, eventIdPath);
    return Buffer.from(JSON.stringify(event));
  });
  const shuffled = shuffle(bodies, seed);
  const first = shuffled[0];
  if (
    shuffled.length > 1 &&
    first &&
    shuffled.every((body, index) => bodies[index]?.equals(body))
  ) {
    const alternateIndex = shuffled.findIndex((body) => !body.equals(first));
    const alternate = shuffled[alternateIndex];
    if (alternate) {
      shuffled[0] = alternate;
      shuffled[alternateIndex] = first;
    }
  }
  return shuffled;
}

/** Compiles a scenario to ordered bodies. Treat the returned buffers as read-only. */
export function compileDeliveries(
  scenario: DeliveryScenario,
  fixture: Buffer,
): readonly ScheduledStep<Buffer>[] {
  if (scenario.scenario === 'invalid_payload') {
    return schedule([Buffer.from(fixture)]);
  }

  const value = parseFixture(fixture);
  if (scenario.scenario === 'out_of_order') {
    return schedule(
      permuteEvents(value, scenario.fixture.eventIdPath, scenario.seed),
    );
  }

  requireEvent(value, scenario.fixture.eventIdPath);
  const count =
    scenario.scenario === 'duplicate' ? (scenario.execution.count ?? 2) : 1;
  if (!Number.isInteger(count) || count < 1 || count > maxDeliveries) {
    throw new DeliveryPlanError(
      'Duplicate delivery count must be an integer between 1 and 100.',
    );
  }
  const body = Buffer.from(fixture);
  return schedule(Array.from({ length: count }, () => body));
}
