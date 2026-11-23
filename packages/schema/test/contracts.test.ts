import { describe, expect, test } from 'vitest';
import {
  runResultJsonSchema,
  runResultSchema,
  scenarioJsonSchema,
  scenarioSchema,
  type RunResultV1,
  type ScenarioV1,
} from '../src/index.js';

const scenario: ScenarioV1 = {
  version: 1,
  name: 'payment-captured',
  scenario: 'duplicate',
  fixture: { path: './fixtures/payment.json', eventIdPath: '$.events[0].id' },
  execution: { timeoutMs: 1500 },
  assertions: [{ kind: 'http_status', expected: 200 }],
  security: {
    allowTargets: ['http://127.0.0.1:3000'],
    redactPaths: ['$.headers.authorization'],
  },
};

const runResult: RunResultV1 = {
  schemaVersion: 1,
  name: scenario.name,
  seed: 42,
  scenarioHash: 'a1'.repeat(32),
  engineVersion: '0.1.0',
  startedAt: '2026-11-23T10:00:00.000Z',
  attempts: [
    { sequence: 0, status: 200, durationMs: 5.5, plannedDelayMs: 0 },
    { sequence: 1, durationMs: 100, errorCode: 'TIMEOUT' },
  ],
  assertions: [
    {
      kind: 'http_status',
      passed: false,
      detail: 'No response on the second attempt',
    },
  ],
  passed: false,
};

describe('ScenarioV1', () => {
  test.each([
    'duplicate',
    'out_of_order',
    'retry',
    'bad_signature',
    'invalid_payload',
  ])('accepts %s and preserves omitted defaults', (kind) => {
    const parsed = scenarioSchema.parse({ ...scenario, scenario: kind });
    expect(parsed.scenario).toBe(kind);
    expect(parsed).not.toHaveProperty('seed');
    expect(parsed.execution).not.toHaveProperty('count');
  });

  test('accepts upper bounds and heterogeneous assertions', () => {
    const configured: ScenarioV1 = {
      ...scenario,
      seed: 0xffffffff,
      execution: {
        timeoutMs: 30_000,
        count: 100,
        fail: 'http_503',
        retry: { maxAttempts: 10, backoffMs: 60_000, statuses: [429, 503] },
      },
      assertions: [
        { kind: 'http_status', expected: [100, 200, 599] },
        {
          kind: 'state_json',
          url: 'http://localhost:3000/_test/state',
          jsonPath: '$',
          equals: { completed: [null, true, { count: 1 }] },
        },
        { kind: 'delivery_count', expected: 0 },
      ],
      security: { allowTargets: [], redactPaths: [] },
    };
    expect(scenarioSchema.parse(configured)).toEqual(configured);
  });

  const invalid: Array<
    [string, Partial<Record<keyof ScenarioV1 | 'extra', unknown>>]
  > = [
    ['unknown version', { version: 2 }],
    ['string version', { version: '1' }],
    ['missing version', { version: undefined }],
    ['blank name', { name: '   ' }],
    ['control character in name', { name: 'payment\ncaptured' }],
    ['unknown scenario kind', { scenario: 'other' }],
    ['unknown field', { extra: true }],
    ['missing fixture', { fixture: undefined }],
    ['missing fixture path', { fixture: { eventIdPath: '$.id' } }],
    ['blank fixture path', { fixture: { path: ' ', eventIdPath: '$.id' } }],
    ['missing event ID path', { fixture: { path: '../payment.json' } }],
    ['event ID root', { fixture: { ...scenario.fixture, eventIdPath: '$' } }],
    [
      'event ID wildcard',
      { fixture: { ...scenario.fixture, eventIdPath: '$.events[*].id' } },
    ],
    [
      'event ID leading zero index',
      { fixture: { ...scenario.fixture, eventIdPath: '$.events[01]' } },
    ],
    [
      'unknown fixture field',
      { fixture: { ...scenario.fixture, url: 'http://localhost/' } },
    ],
    ['negative seed', { seed: -1 }],
    ['oversized seed', { seed: 0x100000000 }],
    ['fractional seed', { seed: 2.5 }],
    ['missing timeout', { execution: {} }],
    ['zero timeout', { execution: { timeoutMs: 0 } }],
    ['oversized timeout', { execution: { timeoutMs: 30_001 } }],
    ['string timeout', { execution: { timeoutMs: '300' } }],
    ['zero count', { execution: { ...scenario.execution, count: 0 } }],
    ['oversized count', { execution: { ...scenario.execution, count: 101 } }],
    [
      'unknown failure',
      { execution: { ...scenario.execution, fail: 'http_404' } },
    ],
    [
      'unknown execution field',
      { execution: { ...scenario.execution, command: 'echo' } },
    ],
    [
      'missing retry statuses',
      {
        execution: {
          ...scenario.execution,
          retry: { maxAttempts: 3, backoffMs: 0 },
        },
      },
    ],
    [
      'oversized retry limit',
      {
        execution: {
          ...scenario.execution,
          retry: { maxAttempts: 11, backoffMs: 0, statuses: [503] },
        },
      },
    ],
    [
      'negative retry backoff',
      {
        execution: {
          ...scenario.execution,
          retry: { maxAttempts: 1, backoffMs: -1, statuses: [] },
        },
      },
    ],
    [
      'oversized retry backoff',
      {
        execution: {
          ...scenario.execution,
          retry: { maxAttempts: 1, backoffMs: 60_001, statuses: [503] },
        },
      },
    ],
    [
      'invalid retry status',
      {
        execution: {
          ...scenario.execution,
          retry: { maxAttempts: 1, backoffMs: 0, statuses: [99] },
        },
      },
    ],
    ['empty assertions', { assertions: [] }],
    ['unknown assertion', { assertions: [{ kind: 'other', expected: 1 }] }],
    [
      'string HTTP status',
      { assertions: [{ kind: 'http_status', expected: '200' }] },
    ],
    [
      'out-of-range HTTP status',
      { assertions: [{ kind: 'http_status', expected: 600 }] },
    ],
    [
      'empty expected statuses',
      { assertions: [{ kind: 'http_status', expected: [] }] },
    ],
    [
      'unknown assertion field',
      {
        assertions: [
          { kind: 'http_status', expected: 200, payload: 'private' },
        ],
      },
    ],
    [
      'fractional delivery count',
      { assertions: [{ kind: 'delivery_count', expected: 1.5 }] },
    ],
    [
      'negative delivery count',
      { assertions: [{ kind: 'delivery_count', expected: -1 }] },
    ],
    [
      'relative state URL',
      {
        assertions: [
          {
            kind: 'state_json',
            url: '/_test/state',
            jsonPath: '$.count',
            equals: 1,
          },
        ],
      },
    ],
    [
      'unsupported state URL scheme',
      {
        assertions: [
          {
            kind: 'state_json',
            url: 'file:///tmp/state',
            jsonPath: '$.count',
            equals: 1,
          },
        ],
      },
    ],
    [
      'missing state expected value',
      {
        assertions: [
          {
            kind: 'state_json',
            url: 'http://localhost/state',
            jsonPath: '$.count',
          },
        ],
      },
    ],
    [
      'invalid state JSON path',
      {
        assertions: [
          {
            kind: 'state_json',
            url: 'http://localhost/state',
            jsonPath: '$..count',
            equals: 1,
          },
        ],
      },
    ],
    [
      'non-JSON state expected value',
      {
        assertions: [
          {
            kind: 'state_json',
            url: 'http://localhost/state',
            jsonPath: '$.count',
            equals: Infinity,
          },
        ],
      },
    ],
    ['missing security', { security: undefined }],
    ['missing allowed targets', { security: { redactPaths: [] } }],
    [
      'bare allowed host',
      { security: { allowTargets: ['localhost'], redactPaths: [] } },
    ],
    [
      'invalid redaction path',
      { security: { allowTargets: [], redactPaths: ['authorization'] } },
    ],
    [
      'unknown security field',
      { security: { ...scenario.security, allowRemote: true } },
    ],
  ];

  test.each(invalid)('rejects %s', (_description, overrides) => {
    expect(
      scenarioSchema.safeParse({ ...scenario, ...overrides }).success,
    ).toBe(false);
  });
});

describe('RunResultV1', () => {
  test('accepts a versioned run with sanitized attempt metadata', () => {
    expect(runResultSchema.parse(runResult)).toEqual(runResult);
  });

  const invalid: Array<
    [string, Partial<Record<keyof RunResultV1 | 'body', unknown>>]
  > = [
    ['unknown schema version', { schemaVersion: 2 }],
    ['invalid scenario hash', { scenarioHash: 'x'.repeat(64) }],
    ['missing scenario hash', { scenarioHash: undefined }],
    ['invalid engine version', { engineVersion: 'latest' }],
    ['missing seed', { seed: undefined }],
    ['invalid timestamp', { startedAt: '2026-11-23' }],
    [
      'non-finite duration',
      { attempts: [{ sequence: 1, durationMs: Infinity }] },
    ],
    [
      'negative delay',
      { attempts: [{ sequence: 1, durationMs: 15, plannedDelayMs: -1 }] },
    ],
    [
      'raw error message',
      { attempts: [{ sequence: 1, durationMs: 15, errorCode: 'raw token' }] },
    ],
    [
      'event identifier',
      { attempts: [{ sequence: 1, durationMs: 15, eventId: 'private' }] },
    ],
    [
      'incorrect assertion outcome type',
      { assertions: [{ kind: 'http_status', passed: 'false', detail: '' }] },
    ],
    ['raw body', { body: 'private' }],
  ];

  test.each(invalid)('rejects %s', (_description, overrides) => {
    expect(
      runResultSchema.safeParse({ ...runResult, ...overrides }).success,
    ).toBe(false);
  });
});

test('exports draft 2020-12 JSON schemas with strict object fields', () => {
  expect(scenarioJsonSchema).toMatchObject({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    additionalProperties: false,
    properties: {
      version: { const: 1 },
      execution: {
        additionalProperties: false,
        properties: { timeoutMs: { minimum: 1, maximum: 30_000 } },
      },
    },
  });
  expect(runResultJsonSchema).toMatchObject({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    additionalProperties: false,
    properties: {
      schemaVersion: { const: 1 },
      attempts: { items: { additionalProperties: false } },
    },
    required: expect.arrayContaining(['seed', 'scenarioHash', 'engineVersion']),
  });
});
