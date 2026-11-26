import { runResultSchema, type RunResultV1 } from '@hookguard/schema';
import { describe, expect, it } from 'vitest';
import { formatJsonReport, formatJunitReport } from '../src/report.js';

const result: RunResultV1 = {
  schemaVersion: 1,
  name: 'Duplicate <payment> & "credits"',
  seed: 42,
  scenarioHash: 'f'.repeat(64),
  engineVersion: '0.0.0',
  startedAt: '2026-11-26T00:00:00.000Z',
  attempts: [{ sequence: 1, status: 200, durationMs: 24, plannedDelayMs: 0 }],
  assertions: [
    { kind: 'http_status', passed: true, detail: 'Expected 200.' },
    {
      kind: 'state_json',
      passed: false,
      detail: 'Observed <3> & "unexpected" values.',
    },
  ],
  passed: false,
};

describe('machine-readable run reports', () => {
  it('writes a schema-valid JSON report that retains attempt and assertion evidence', () => {
    const output = formatJsonReport(result);
    expect(runResultSchema.parse(JSON.parse(output))).toEqual(result);
    expect(output.endsWith('\n')).toBe(true);
  });

  it('rejects fields outside the result contract before serialization', () => {
    const extraEvidence = { ...result, fixture: { confidential: 'secret' } };
    expect(() => formatJsonReport(extraEvidence)).toThrow();
    expect(() => formatJunitReport(extraEvidence)).toThrow();
  });

  it('writes JUnit test cases, failure counts, and escaped failure evidence', () => {
    expect(formatJunitReport(result)).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<testsuites tests="2" failures="1">\n' +
        '  <testsuite name="Duplicate &lt;payment&gt; &amp; &quot;credits&quot;" tests="2" failures="1">\n' +
        '    <testcase classname="hookguard" name="1. http_status"/>\n' +
        '    <testcase classname="hookguard" name="2. state_json">\n' +
        '      <failure message="Assertion failed">Observed &lt;3&gt; &amp; &quot;unexpected&quot; values.</failure>\n' +
        '    </testcase>\n' +
        '  </testsuite>\n' +
        '</testsuites>\n',
    );
  });

  it('replaces XML-invalid code points while retaining Unicode and escaped apostrophes', () => {
    const withControls = {
      ...result,
      assertions: [
        {
          kind: 'state_json',
          passed: false,
          detail: "café 🍵 '\u0000\ufffe\ud800",
        },
      ],
    };
    expect(formatJunitReport(withControls)).toContain('café 🍵 &apos;���');
  });

  it('reports no failures for a passing run', () => {
    const passed = {
      ...result,
      assertions: result.assertions.slice(0, 1),
      passed: true,
    };
    const junit = formatJunitReport(passed);
    expect(junit).toContain('tests="1" failures="0"');
    expect(junit).not.toContain('<failure ');
  });
});
