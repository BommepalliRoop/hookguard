import { runResultSchema, type RunResultV1 } from '@hookguard/schema';

export function formatJsonReport(result: RunResultV1): string {
  return JSON.stringify(runResultSchema.parse(result), null, 2) + '\n';
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

export function formatJunitReport(result: RunResultV1): string {
  const { name, assertions } = runResultSchema.parse(result);
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
