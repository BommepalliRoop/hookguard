import { runResultSchema, type RunResultV1 } from '@hookguard/schema';
import { expect, it } from 'vitest';
import {
  redactRunResult,
  renderJsonReport,
  renderJunitReport,
} from '../src/report.js';

function failedRun(): RunResultV1 {
  return {
    schemaVersion: 1,
    name: 'Synthetic payments',
    seed: 42,
    scenarioHash: 'a'.repeat(64),
    engineVersion: '0.1.0',
    startedAt: '2026-11-23T08:00:00.000Z',
    attempts: [
      {
        sequence: 0,
        status: 503,
        errorCode: 'simulated_status',
        durationMs: 8,
      },
      { sequence: 1, status: 200, durationMs: 2, plannedDelayMs: 10 },
    ],
    assertions: [
      { kind: 'http_status', passed: true, detail: 'Final status was 200.' },
      { kind: 'state_json', passed: false, detail: 'Expected 1, observed 3.' },
    ],
    passed: false,
  };
}

it('renders declared JSON with the trace and assertion evidence intact', () => {
  const result = failedRun();
  const report: unknown = JSON.parse(renderJsonReport(result));
  expect(runResultSchema.parse(report)).toEqual(result);
});

it('applies result paths to an exact field or ancestor without changing numeric evidence', () => {
  const result = failedRun();
  const options = {
    redactPaths: [
      '$.name',
      '$.assertions[1]',
      '$.attempts',
      '$.assertions[0].passed',
      '$.headers.authorization',
    ],
  };
  const expected = {
    ...result,
    name: '[REDACTED]',
    attempts: [
      { ...result.attempts[0], errorCode: 'redacted' },
      result.attempts[1],
    ],
    assertions: [
      result.assertions[0],
      { kind: '[REDACTED]', passed: false, detail: '[REDACTED]' },
    ],
  };
  expect(redactRunResult(result, options)).toEqual(expected);
  expect(
    runResultSchema.parse(JSON.parse(renderJsonReport(result, options))),
  ).toEqual(expected);
  const junit = renderJunitReport(result, options);
  expect(junit).toContain('classname="[REDACTED]" name="[REDACTED]"');
  expect(junit).toContain('>[REDACTED]</failure>');
  expect(result).toEqual(failedRun());
});

it('redacts a single detail or all presentation fields through the root path', () => {
  const result = failedRun();
  const exact = redactRunResult(result, {
    redactPaths: ['$.assertions[0].detail'],
  });
  expect(exact.assertions).toEqual([
    { ...result.assertions[0], detail: '[REDACTED]' },
    result.assertions[1],
  ]);
  const root = redactRunResult(result, { redactPaths: ['$'] });
  expect(root.name).toBe('[REDACTED]');
  expect(root.seed).toBe(42);
  expect(root.assertions).toEqual([
    { kind: '[REDACTED]', detail: '[REDACTED]', passed: true },
    { kind: '[REDACTED]', detail: '[REDACTED]', passed: false },
  ]);
});

it('removes known secrets, credential tokens and raw URLs from both formats', () => {
  const known = 'local"$&-suite-key';
  const code = 'private_error';
  const bearer = 'synthetic.jwt-token.bits';
  const basic = 'ZHVtbXk6c2VjcmV0';
  const credentialUrl = 'http://demo:fake-password@localhost/path';
  const rawUrl = 'https://localhost/payment?token=fixture-key';
  const result = failedRun();
  result.name = 'Synthetic ' + known;
  result.attempts[0]!.errorCode = code;
  result.assertions[1]!.detail =
    'Header BEARER ' +
    bearer +
    ' or basic ' +
    basic +
    ' from ' +
    credentialUrl +
    ' and ' +
    rawUrl +
    ' with ' +
    known;
  const options = { secrets: ['', code, 'suite-key', known] };
  const json = renderJsonReport(result, options);
  const junit = renderJunitReport(result, options);
  for (const secret of [
    known,
    code,
    bearer,
    basic,
    'fake-password',
    'fixture-key',
    'localhost',
  ]) {
    expect(json).not.toContain(secret);
    expect(junit).not.toContain(secret);
  }
  const parsed = runResultSchema.parse(JSON.parse(json));
  expect(parsed.name).toBe('Synthetic [REDACTED]');
  expect(parsed.attempts[0]?.errorCode).toBe('redacted');
  expect(parsed.assertions[1]?.detail).toBe(
    'Header [REDACTED] or [REDACTED] from [REDACTED] and [REDACTED] with [REDACTED]',
  );
  expect(junit).toContain('[REDACTED]</failure>');
});

it('escapes XML attributes and failure text, replacing invalid XML characters', () => {
  const result = failedRun();
  result.name = 'A<&"\' \ud800 test \u{1f680}';
  result.assertions[1]!.kind = 'state<failure>';
  result.assertions[1]!.detail =
    'Broken </failure> & "\'\r\n\t\u0000\u000b\udfff\ufffe';
  const junit = renderJunitReport(result);
  expect(junit).toContain(
    '<testsuite name="A&lt;&amp;&quot;&apos; \ufffd test \u{1f680}" tests="2" failures="1"',
  );
  expect(junit).toContain('name="http_status" />');
  expect(junit).toContain('name="state&lt;failure&gt;"');
  expect(junit).toContain(
    '<failure type="AssertionFailure" message="Assertion failed">Broken &lt;/failure&gt; &amp; &quot;&apos;&#13;&#10;&#9;\ufffd\ufffd\ufffd\ufffd</failure>',
  );
  expect(junit).toContain(
    '<property name="scenarioHash" value="' + result.scenarioHash + '" />',
  );
});

it('rejects undeclared result fields without printing their secrets in errors', () => {
  const confidential = 'synthetic-body-secret';
  const invalid = { ...failedRun(), body: confidential };
  for (const render of [redactRunResult, renderJsonReport, renderJunitReport]) {
    expect(() => render(invalid)).toThrow(new Error('Invalid run result.'));
  }
});
