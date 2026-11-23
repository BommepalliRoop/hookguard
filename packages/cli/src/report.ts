import { runResultSchema, type RunResultV1 } from '@hookguard/schema';

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

export function renderJsonReport(
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
  '\t': '&#9;',
  '\n': '&#10;',
  '\r': '&#13;',
};

// Characters outside the XML 1.0 Char production.
const invalidXml = /[^\t\n\r\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu;

function escapeXml(value: string): string {
  return value
    .replace(invalidXml, '\ufffd')
    .replace(
      /[&<>"'\t\n\r]/gu,
      (character) => xmlEntities[character] ?? character,
    );
}

export function renderJunitReport(
  result: RunResultV1,
  options?: RedactionOptions,
): string {
  const report = redactRunResult(result, options);
  const name = escapeXml(report.name);
  const failureCount = report.assertions.filter(({ passed }) => !passed).length;
  const properties = {
    schemaVersion: report.schemaVersion,
    scenarioHash: report.scenarioHash,
    engineVersion: report.engineVersion,
    seed: report.seed,
    attempts: report.attempts.length,
    passed: report.passed,
  };
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuite name="' +
      name +
      '" tests="' +
      report.assertions.length +
      '" failures="' +
      failureCount +
      '" timestamp="' +
      escapeXml(report.startedAt) +
      '">',
    '  <properties>',
  ];
  for (const [key, value] of Object.entries(properties)) {
    lines.push(
      '    <property name="' +
        key +
        '" value="' +
        escapeXml(String(value)) +
        '" />',
    );
  }
  lines.push('  </properties>');
  for (const assertion of report.assertions) {
    const testcase =
      '  <testcase classname="' +
      name +
      '" name="' +
      escapeXml(assertion.kind) +
      '"';
    if (assertion.passed) {
      lines.push(testcase + ' />');
    } else {
      lines.push(
        testcase + '>',
        '    <failure type="AssertionFailure" message="Assertion failed">' +
          escapeXml(assertion.detail) +
          '</failure>',
        '  </testcase>',
      );
    }
  }
  lines.push('</testsuite>', '');
  return lines.join('\n');
}
