import { Buffer } from 'node:buffer';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type TestContext } from 'vitest';
import { ConfigError, loadScenario } from '../src/index.js';

const yaml = [
  'version: 1',
  'name: payment-captured',
  'scenario: duplicate',
  'fixture:',
  '  path: "./fixtures/payment.json"',
  '  eventIdPath: $.id',
  'execution: { timeoutMs: 2000 }',
  'assertions:',
  '  - kind: state_json',
  '    url: http://127.0.0.1:3000/_test/state',
  '    jsonPath: $.orders[0]',
  '    equals: { status: "captured: paid !ok", credits: [1, null, true] }',
  'security: { allowTargets: [], redactPaths: [] }',
  '',
].join('\n');

async function writeConfig(
  onTestFinished: TestContext['onTestFinished'],
  text: string | Buffer,
  filename = 'scenario.yaml',
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'hookguard-config-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, filename);
  await writeFile(path, text);
  return path;
}

test('loads strict YAML with JSON values and local relative fixture paths', async ({
  onTestFinished,
}) => {
  const path = await writeConfig(onTestFinished, yaml);
  await expect(loadScenario(path)).resolves.toMatchObject({
    version: 1,
    fixture: { path: './fixtures/payment.json', eventIdPath: '$.id' },
    assertions: [
      { equals: { status: 'captured: paid !ok', credits: [1, null, true] } },
    ],
  });
});

test('loads JSON with arbitrary quoted property names and nested values', async ({
  onTestFinished,
}) => {
  const scenario = await loadScenario(await writeConfig(onTestFinished, yaml));
  const equals = {
    '["!literal"]': ['sequence: []', '👋', true, { 'a=b': null }],
    ['__proto__']: { own: true },
    ['a'.repeat(1025)]: null,
  };
  const data = {
    ...scenario,
    assertions: [
      {
        kind: 'state_json',
        url: 'http://127.0.0.1:3000/_test/state',
        jsonPath: '$',
        equals,
      },
    ],
  };
  const config = await writeConfig(
    onTestFinished,
    JSON.stringify(data),
    'scenario.JSON',
  );
  await expect(loadScenario(config)).resolves.toEqual(data);
});

test('reports field paths without quoting rejected values or unknown keys', async ({
  onTestFinished,
}) => {
  const invalid =
    yaml.replace('2000', 'secret-timeout') + 'secret-key: secret-value\n';
  const path = await writeConfig(onTestFinished, invalid);
  await expect(loadScenario(path)).rejects.toMatchObject({
    name: 'ConfigError',
    issues: [
      { path: '$.execution.timeoutMs', message: 'must be number' },
      { path: '$', message: 'contains unknown fields' },
    ],
  });
  await expect(loadScenario(path)).rejects.not.toThrow('secret-');
});

test.for([
  [
    'alias',
    yaml
      .replace('name: payment-captured', 'name: &label payment-captured')
      .replace('path: "./fixtures/payment.json"', 'path: *label'),
    'YAML alias',
  ],
  ['duplicate key', yaml + 'version: 1\n', 'duplicate key'],
  [
    'custom tag',
    yaml.replace('name: payment-captured', 'name: !secret payment-captured'),
    'unsupported YAML tag',
  ],
  ['multiple documents', yaml + '---\n{}\n', 'exactly one'],
  ['empty input', '# comment only\n', 'exactly one'],
  ['legacy YAML', '%YAML 1.1\n---\n' + yaml, 'requires YAML 1.2'],
  [
    'bad syntax',
    yaml + 'secret-private: [unclosed\n',
    'invalid configuration syntax',
  ],
  [
    'non-scalar key',
    yaml + '? [secret-key]\n: secret-value\n',
    'invalid configuration syntax',
  ],
] as const)(
  'rejects %s without showing the document source',
  async ([, text, message], { onTestFinished }) => {
    const path = await writeConfig(onTestFinished, text);
    const result = loadScenario(path);
    await expect(result).rejects.toBeInstanceOf(ConfigError);
    await expect(result).rejects.toThrow(message);
    await expect(result).rejects.not.toThrow('secret-');
  },
);

test('rejects JSON syntax accepted only by YAML and duplicate JSON keys', async ({
  onTestFinished,
}) => {
  const yamlNamedJson = await writeConfig(onTestFinished, yaml, 'wrong.json');
  await expect(loadScenario(yamlNamedJson)).rejects.toThrow(
    'invalid JSON syntax',
  );
  const duplicate = await writeConfig(
    onTestFinished,
    '{"version":1,"\\u0076ersion":1,"secret-key":"private"}',
    'duplicate.json',
  );
  await expect(loadScenario(duplicate)).rejects.toThrow('duplicate key');
});

test('rejects invalid UTF-8 and the 256 KiB limit counts bytes', async ({
  onTestFinished,
}) => {
  const invalid = await writeConfig(onTestFinished, Buffer.from([0xc3, 0x28]));
  await expect(loadScenario(invalid)).rejects.toThrow('valid UTF-8');
  const oversized = await writeConfig(
    onTestFinished,
    yaml + '#' + 'é'.repeat(128 * 1024),
  );
  await expect(loadScenario(oversized)).rejects.toThrow(
    '256 KiB configuration limit',
  );
});

test('rejects a missing local file and a UNC path without exposing either', async ({
  onTestFinished,
}) => {
  const file = await writeConfig(onTestFinished, yaml);
  await expect(loadScenario(file + '-missing')).rejects.toThrow(
    'could not read',
  );
  await expect(
    loadScenario('\\\\server\\share\\scenario.yaml'),
  ).rejects.toThrow('local configuration file');
});
