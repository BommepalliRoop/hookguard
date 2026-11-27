import { runResultSchema, type RunResultV1 } from '@hookguard/schema';
import { describe, expect, it } from 'vitest';
import {
  formatJsonReport,
  formatJunitReport,
  renderHtmlReport,
} from '../src/report.js';

const result: RunResultV1 = {
  schemaVersion: 1,
  name: 'Duplicate <payment> & "credits"',
  seed: 42,
  scenarioHash: 'f'.repeat(64),
  engineVersion: '0.1.0-alpha.1+build.2',
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
    expect(() => renderHtmlReport(extraEvidence)).toThrow(
      'Invalid run result.',
    );
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

  it('redacts configured secrets in the scenario name and assertion text across formats', () => {
    const secret = 'synthetic-secret';
    const sensitive = {
      ...result,
      name: 'Duplicate ' + secret,
      assertions: [
        { kind: 'state_json', passed: false, detail: 'Value: ' + secret },
      ],
    };
    for (const format of [
      formatJsonReport,
      formatJunitReport,
      renderHtmlReport,
    ]) {
      const output = format(sensitive, { secrets: [secret] });
      expect(output).not.toContain(secret);
      expect(output).toContain('Duplicate [REDACTED]');
      expect(output).toContain('Value: [REDACTED]');
    }
    expect(
      runResultSchema.parse(
        JSON.parse(formatJsonReport(sensitive, { secrets: [secret] })),
      ).name,
    ).toBe('Duplicate [REDACTED]');
    expect(sensitive.name).toContain(secret);
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

  it('renders static escaped HTML with the trace and assertion outcomes', () => {
    const html = renderHtmlReport(result);
    expect(html).toContain(
      '<h1>Duplicate &lt;payment&gt; &amp; &quot;credits&quot;</h1>',
    );
    expect(html).toContain('<strong>Failed</strong>');
    expect(html).toContain(
      '<td>1</td><td>200</td><td>—</td><td>0</td><td>24</td>',
    );
    expect(html).toContain(
      '<td>state_json</td><td>Failed</td><td>Observed &lt;3&gt; &amp; &quot;unexpected&quot; values.</td>',
    );
    expect(html).not.toMatch(/<script\b|\s(?:src|href)=/i);
  });

  it('redacts selected result fields, secrets, raw URLs and authorization values before HTML escaping', () => {
    const html = renderHtmlReport(
      {
        ...result,
        name: 'private suite name',
        assertions: [
          {
            kind: 'check',
            passed: false,
            detail:
              'local-secret Bearer abc.123 https://localhost/private <failure>',
          },
        ],
      },
      { redactPaths: ['$.name'], secrets: ['local-secret'] },
    );
    expect(html).toContain('<h1>[REDACTED]</h1>');
    expect(html).toContain('[REDACTED] [REDACTED] [REDACTED] &lt;failure&gt;');
    expect(html).not.toMatch(/private suite|local-secret|abc\.123|localhost/);
  });

  it('shows empty results without inventing attempts or assertions', () => {
    const html = renderHtmlReport({
      ...result,
      passed: true,
      attempts: [],
      assertions: [],
    });
    expect(html).toContain('<strong>Passed</strong>');
    expect(html).toContain('No delivery attempts recorded.');
    expect(html).toContain('No assertions recorded.');
  });
});
