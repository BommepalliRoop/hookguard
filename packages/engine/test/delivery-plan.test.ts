import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import type { ScenarioV1 } from '../../schema/src/index.js';
import {
  compileDeliveries,
  DeliveryPlanError,
  lookupJsonPath,
} from '../src/delivery-plan.js';

function scenario(
  kind: ScenarioV1['scenario'],
  options: Partial<ScenarioV1> = {},
): ScenarioV1 {
  return {
    version: 1,
    name: 'synthetic delivery',
    scenario: kind,
    fixture: { path: 'fixture.json', eventIdPath: '$.details[0].id' },
    execution: { timeoutMs: 1000 },
    assertions: [{ kind: 'delivery_count', expected: 1 }],
    security: { allowTargets: [], redactPaths: [] },
    ...options,
  };
}

const eventWith = (id: unknown) => ({ details: [{ id }] });
const asBody = (value: unknown) => Buffer.from(JSON.stringify(value));

describe('lookupJsonPath', () => {
  it('resolves root, own object keys, array indices, and JSON null values', () => {
    const value = { events: [{ 'event-id': 'synthetic', status: null }] };
    expect(lookupJsonPath(value, '$')).toBe(value);
    expect(lookupJsonPath(value, '$.events[0].event-id')).toBe('synthetic');
    expect(lookupJsonPath(value, '$.events[0].status')).toBeNull();
    expect(lookupJsonPath(value, '$.events[1]')).toBeUndefined();
    expect(lookupJsonPath({ 0: 'own-0' }, '$.0')).toBe('own-0');
  });

  it.each([
    '',
    'events[0]',
    '$.events.0',
    '$.events.length',
    '$.events[00]',
    '$.events[*]',
    '$.events[0].',
    '$.events[0]\n',
  ])('returns undefined for unsupported traversal %s', (path) => {
    expect(
      lookupJsonPath({ events: [{ id: 'synthetic' }] }, path),
    ).toBeUndefined();
  });

  it('ignores inherited properties and accessors while permitting own JSON data keys', () => {
    const json: unknown = JSON.parse('{"__proto__":{"id":7}}');
    expect(lookupJsonPath(json, '$.__proto__.id')).toBe(7);
    expect(lookupJsonPath({}, '$.constructor')).toBeUndefined();
    expect(
      lookupJsonPath(
        {
          get id() {
            throw new Error('Accessor called');
          },
        },
        '$.id',
      ),
    ).toBeUndefined();
  });

  it('ignores numeric array properties outside the array index range', () => {
    const value = Object.assign(['first'], { 4294967295: 'outside' });
    expect(lookupJsonPath(value, '$[4294967295]')).toBeUndefined();
  });
});

describe('compileDeliveries', () => {
  it('duplicates the exact fixture bytes with stable numbering and a default count of two', () => {
    const original = ' { "details": [{ "id": "evt-1" }] }\n';
    const source = Buffer.from(original);
    const configured = scenario('duplicate');
    const steps = compileDeliveries(configured, source);
    expect(source.toString()).toBe(original);
    source.fill(0);
    expect(
      steps.map(({ sequence, event }) => [sequence, event.toString()]),
    ).toEqual([
      [1, original],
      [2, original],
    ]);
    expect(Object.isFrozen(steps)).toBe(true);
    expect(steps.every(Object.isFrozen)).toBe(true);
  });

  it('accepts a configured duplicate count through 100 and validates bounds', () => {
    const body = asBody(eventWith(50));
    expect(
      compileDeliveries(
        scenario('duplicate', { execution: { timeoutMs: 1000, count: 100 } }),
        body,
      ),
    ).toHaveLength(100);
    for (const count of [0, 1.1, 101]) {
      const configured = scenario('duplicate', {
        execution: { timeoutMs: 1000, count },
      });
      expect(() => compileDeliveries(configured, body)).toThrow(
        DeliveryPlanError,
      );
    }
  });

  it('uses the seed to create a deterministic alternative order for all fixture events', () => {
    const events = ['a', 'b', 'c', 'd'].map(eventWith);
    const configured = scenario('out_of_order', { seed: 42 });
    const bodies = compileDeliveries(configured, asBody(events));
    expect(bodies.map(({ sequence }) => sequence)).toEqual([1, 2, 3, 4]);
    expect(bodies.map(({ event }) => event)).toEqual(
      [events[0], events[3], events[1], events[2]].map(asBody),
    );
    expect(compileDeliveries(configured, asBody(events))).toEqual(bodies);
  });

  it('avoids identity for two events and accepts a singleton or a full-size array', () => {
    const first = eventWith('a');
    const second = eventWith('b');
    const configured = scenario('out_of_order', { seed: 42 });
    expect(
      compileDeliveries(configured, asBody([first, second])).map(
        ({ event }) => event,
      ),
    ).toEqual([asBody(second), asBody(first)]);
    expect(compileDeliveries(configured, asBody([first]))).toEqual([
      { sequence: 1, event: asBody(first) },
    ]);
    expect(
      compileDeliveries(
        configured,
        asBody(Array.from({ length: 100 }, (_, id) => eventWith(id))),
      ),
    ).toHaveLength(100);
  });

  it('delivers every event even when there is no observable alternate order', () => {
    const event = eventWith('evt-1');
    expect(
      compileDeliveries(scenario('out_of_order'), asBody([event, event])),
    ).toEqual([
      { sequence: 1, event: asBody(event) },
      { sequence: 2, event: asBody(event) },
    ]);
  });

  it('rejects empty, oversized or invalid out-of-order fixtures', () => {
    const event = eventWith('evt-1');
    const configured = scenario('out_of_order');
    for (const invalid of [
      [],
      event,
      [event, null],
      Array.from({ length: 101 }, () => event),
    ]) {
      expect(() => compileDeliveries(configured, asBody(invalid))).toThrow(
        DeliveryPlanError,
      );
    }
  });

  it.each(['retry', 'bad_signature'] as const)(
    'plans one original body for %s',
    (kind) => {
      const fixture = Buffer.from(' { "details": [{ "id": "evt-1" }] }\n');
      const configured = scenario(kind, {
        execution: { timeoutMs: 1000, count: 95 },
      });
      expect(compileDeliveries(configured, fixture)).toEqual([
        { sequence: 1, event: fixture },
      ]);
    },
  );

  it('keeps invalid payload bytes and skips parsing', () => {
    const fixture = Buffer.from([0xff, 0x00, 0x31]);
    const steps = compileDeliveries(scenario('invalid_payload'), fixture);
    expect(steps).toEqual([{ sequence: 1, event: fixture }]);
    expect(steps[0]?.event).not.toBe(fixture);
  });

  it.each([
    undefined,
    null,
    '',
    '  ',
    true,
    0.1,
    Number.MAX_SAFE_INTEGER + 1,
    {},
  ])('rejects unsupported IDs %s', (id) => {
    expect(() =>
      compileDeliveries(scenario('duplicate'), asBody(eventWith(id))),
    ).toThrow('Fixture event ID must be a nonblank string or safe integer.');
  });

  it('fails on malformed JSON and invalid UTF-8 with static errors', () => {
    const configured = scenario('retry');
    const invalidUtf8 = Buffer.concat([
      Buffer.from('{"details":[{"id":"'),
      Buffer.from([0xff]),
      Buffer.from('"}]}'),
    ]);
    for (const body of [Buffer.from('{"private-test-value"'), invalidUtf8]) {
      expect(() => compileDeliveries(configured, body)).toThrow(
        'Fixture must contain valid UTF-8 JSON.',
      );
    }
  });
});
