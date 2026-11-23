import { Buffer } from 'node:buffer';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { extname } from 'node:path';
import { TextDecoder } from 'node:util';
import { isAlias, isNode, LineCounter, parseAllDocuments, visit } from 'yaml';
import { type ZodIssue } from 'zod';
import { scenarioSchema, type ScenarioV1 } from './contracts.js';

const maxConfigBytes = 256 * 1024;
const coreTags = new Set(
  ['null', 'bool', 'int', 'float', 'str', 'map', 'seq'].map(
    (type) => 'tag:yaml.org,2002:' + type,
  ),
);

type ConfigIssue = { path: string; message: string };

export class ConfigError extends Error {
  constructor(readonly issues: readonly ConfigIssue[]) {
    super(issues.map(({ path, message }) => path + ' ' + message).join('\n'));
    this.name = 'ConfigError';
  }
}

function invalid(message: string): never {
  throw new ConfigError([{ path: '$', message }]);
}

async function readConfig(configPath: string): Promise<string> {
  if (/^[\\/]{2}/u.test(configPath))
    invalid('requires a local configuration file');

  const bytes = Buffer.alloc(maxConfigBytes + 1);
  let length = 0;
  try {
    const handle = await open(
      configPath,
      constants.O_RDONLY | (constants.O_NONBLOCK ?? 0),
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) invalid('requires a regular configuration file');
      if (stat.size > maxConfigBytes)
        invalid('exceeds the 256 KiB configuration limit');
      while (length < bytes.length) {
        const { bytesRead } = await handle.read(
          bytes,
          length,
          bytes.length - length,
          length,
        );
        if (bytesRead === 0) break;
        length += bytesRead;
      }
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    invalid('could not read the configuration file');
  }
  if (length > maxConfigBytes)
    invalid('exceeds the 256 KiB configuration limit');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      bytes.subarray(0, length),
    );
  } catch {
    invalid('must be valid UTF-8');
  }
}

function parseConfig(text: string, isJson: boolean): unknown {
  try {
    // The YAML syntax tree preserves duplicate keys that JSON.parse would overwrite.
    const json: unknown = isJson ? JSON.parse(text) : undefined;
    const lineCounter = new LineCounter();
    const [document, extra] = parseAllDocuments(text, {
      lineCounter,
      prettyErrors: false,
      strict: !isJson,
      uniqueKeys: true,
      stringKeys: true,
      schema: 'core',
      merge: false,
    });
    if (!document || extra)
      invalid('requires exactly one configuration document');

    const issue = document.errors[0] ?? document.warnings[0];
    if (issue) {
      const { line, col } = lineCounter.linePos(issue.pos[0]);
      const location = ' at line ' + line + ', column ' + col;
      if (issue.code === 'DUPLICATE_KEY')
        invalid('contains a duplicate key' + location);
      if (issue.code === 'TAG_RESOLVE_FAILED')
        invalid('contains an unsupported YAML tag' + location);
      invalid('has invalid configuration syntax' + location);
    }
    if (document.directives.yaml.version !== '1.2')
      invalid('requires YAML 1.2');
    visit(document, (_key, node) => {
      if (isAlias(node)) invalid('contains a YAML alias');
      if (isNode(node) && node.tag && !coreTags.has(node.tag)) {
        invalid('contains an unsupported YAML tag');
      }
    });
    return isJson ? json : document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    invalid(isJson ? 'has invalid JSON syntax' : 'has invalid YAML syntax');
  }
}

function configIssue(issue: ZodIssue): ConfigIssue {
  const path = issue.path.reduce<string>(
    (path, part) =>
      path + (typeof part === 'number' ? '[' + part + ']' : '.' + String(part)),
    '$',
  );
  switch (issue.code) {
    case 'unrecognized_keys':
      return { path, message: 'contains unknown fields' };
    case 'invalid_type':
      return { path, message: 'must be ' + issue.expected };
    case 'too_small':
    case 'too_big':
    case 'invalid_value':
      return { path, message: issue.message };
    default:
      return { path, message: 'has an invalid value' };
  }
}

export async function loadScenario(configPath: string): Promise<ScenarioV1> {
  const data = parseConfig(
    await readConfig(configPath),
    extname(configPath).toLowerCase() === '.json',
  );
  const result = scenarioSchema.safeParse(data);
  if (!result.success)
    throw new ConfigError(result.error.issues.map(configIssue));
  return result.data;
}
