import { runResultSchema, type RunResultV1 } from '@hookguard/schema';

export function formatJsonReport(
  result: RunResultV1,
  options?: RedactionOptions,
): string {
  return JSON.stringify(redactRunResult(result, options), null, 2) + '\n';
}

const xmlEntities: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

// XML 1.0 excludes some code points even when written as character references.
const invalidXmlCharacter =
  // eslint-disable-next-line no-control-regex
  /[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu;

function escapeXml(value: string): string {
  return value
    .replace(invalidXmlCharacter, '\ufffd')
    .replace(/[&<>"']/gu, (character) => xmlEntities[character] ?? character);
}

export function formatJunitReport(
  result: RunResultV1,
  options?: RedactionOptions,
): string {
  const { name, assertions } = redactRunResult(result, options);
  const failures = assertions.filter(({ passed }) => !passed).length;
  const counts = `tests="${assertions.length}" failures="${failures}"`;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites ${counts}>`,
    `  <testsuite name="${escapeXml(name)}" ${counts}>`,
  ];

  assertions.forEach(({ kind, passed, detail }, index) => {
    const testCase = `    <testcase classname="hookguard" name="${index + 1}. ${escapeXml(kind)}"`;
    if (passed) {
      lines.push(testCase + '/>');
    } else {
      lines.push(
        testCase + '>',
        `      <failure message="Assertion failed">${escapeXml(detail)}</failure>`,
        '    </testcase>',
      );
    }
  });

  lines.push('  </testsuite>', '</testsuites>', '');
  return lines.join('\n');
}

export type RedactionOptions = {
  redactPaths?: readonly string[];
  secrets?: readonly string[];
};

const redacted = '[REDACTED]';
const authorization = /\b(?:bearer|basic)\s+["']?[a-z0-9._~+/=-]+/giu;
const absoluteUrl = /\b[a-z][a-z0-9+.-]{0,31}:\/\/[^\s<>"']+/giu;

function validateRunResult(result: unknown): RunResultV1 {
  const parsed = runResultSchema.safeParse(result);
  if (!parsed.success) throw new Error('Invalid run result.');
  return parsed.data;
}

function presentationRedactor({
  redactPaths = [],
  secrets = [],
}: RedactionOptions) {
  const literals = [
    ...new Set(secrets.filter((secret) => secret.length > 0)),
  ].sort((left, right) => right.length - left.length);

  return (value: string, path: string): string => {
    if (
      redactPaths.some(
        (selected) =>
          path === selected ||
          path.startsWith(selected + '.') ||
          path.startsWith(selected + '['),
      )
    ) {
      return redacted;
    }

    let cleaned = value
      .replace(absoluteUrl, redacted)
      .replace(authorization, redacted);
    for (const secret of literals)
      cleaned = cleaned.replaceAll(secret, redacted);
    return cleaned;
  };
}

export function redactRunResult(
  result: RunResultV1,
  options: RedactionOptions = {},
): RunResultV1 {
  const report = validateRunResult(result);
  const redact = presentationRedactor(options);
  return validateRunResult({
    ...report,
    name: redact(report.name, '$.name'),
    attempts: report.attempts.map((attempt, index) => {
      const errorCode = attempt.errorCode;
      if (errorCode === undefined) return attempt;
      return {
        ...attempt,
        errorCode:
          redact(errorCode, '$.attempts[' + index + '].errorCode') === errorCode
            ? errorCode
            : 'redacted',
      };
    }),
    assertions: report.assertions.map((assertion, index) => {
      const path = '$.assertions[' + index + ']';
      return {
        ...assertion,
        kind: redact(assertion.kind, path + '.kind'),
        detail: redact(assertion.detail, path + '.detail'),
      };
    }),
  });
}

export function renderHtmlReport(
  result: RunResultV1,
  options?: RedactionOptions,
): string {
  const report = redactRunResult(result, options);
  const name = escapeXml(report.name);
  const outcome = (passed: boolean) => (passed ? 'Passed' : 'Failed');
  const lines = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\">",
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${name} | HookGuard report</title>`,
    '<style>body{font:1rem/1.5 system-ui,sans-serif;margin:2rem auto;padding:0 1rem;max-width:72rem;color:#172530;background:white}h1,h2{line-height:1.2}dt{font-weight:bold}dd{margin:0 0 .5rem;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:.4rem;border-bottom:1px solid #aebac0;overflow-wrap:anywhere}th{background:#eef3f4}.scroll{overflow-x:auto}</style>',
    '</head><body><main>',
    `<h1>${name}</h1><p>Run outcome: <strong>${outcome(report.passed)}</strong></p>`,
    '<dl>',
    `<dt>Started</dt><dd>${escapeXml(report.startedAt)}</dd>`,
    `<dt>Seed</dt><dd>${report.seed}</dd>`,
    `<dt>Scenario hash</dt><dd><code>${escapeXml(report.scenarioHash)}</code></dd>`,
    `<dt>Engine version</dt><dd>${escapeXml(report.engineVersion)}</dd>`,
    '</dl><h2>Delivery attempts</h2>',
  ];
  if (report.attempts.length) {
    lines.push(
      '<div class="scroll"><table><thead><tr><th scope="col">Sequence</th><th scope="col">HTTP status</th><th scope="col">Error</th><th scope="col">Planned delay (ms)</th><th scope="col">Duration (ms)</th></tr></thead><tbody>',
    );
    for (const attempt of report.attempts) {
      lines.push(
        `<tr><td>${attempt.sequence}</td><td>${attempt.status ?? '—'}</td><td>${escapeXml(attempt.errorCode ?? '—')}</td><td>${attempt.plannedDelayMs ?? '—'}</td><td>${attempt.durationMs}</td></tr>`,
      );
    }
    lines.push('</tbody></table></div>');
  } else {
    lines.push('<p>No delivery attempts recorded.</p>');
  }
  lines.push('<h2>Assertions</h2>');
  if (report.assertions.length) {
    lines.push(
      '<div class="scroll"><table><thead><tr><th scope="col">Assertion</th><th scope="col">Outcome</th><th scope="col">Detail</th></tr></thead><tbody>',
    );
    for (const assertion of report.assertions) {
      lines.push(
        `<tr><td>${escapeXml(assertion.kind)}</td><td>${outcome(assertion.passed)}</td><td>${escapeXml(assertion.detail)}</td></tr>`,
      );
    }
    lines.push('</tbody></table></div>');
  } else {
    lines.push('<p>No assertions recorded.</p>');
  }
  lines.push('</main></body></html>', '');
  return lines.join('\n');
}
