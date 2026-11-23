import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FixtureError, readFixture } from '../src/fixture.js';

describe('config-relative fixture files', () => {
  let parent: string;
  let scenario: string;
  let config: string;
  beforeEach(async () => {
    parent = await mkdtemp(join(tmpdir(), 'hookguard-fixture-'));
    scenario = join(parent, 'scenario');
    config = join(scenario, 'hookguard.yml');
    await mkdir(join(scenario, 'fixtures'), { recursive: true });
    await writeFile(config, 'version: 1\n');
  });
  afterEach(async () => {
    await rm(parent, { recursive: true, force: true });
  });

  it('preserves the original fixture bytes including malformed JSON, newlines and non-UTF8 bytes', async () => {
    const bytes = Buffer.from([123, 13, 10, 0xff, 0, 10]);
    await writeFile(join(scenario, 'fixtures', 'payment.json'), bytes);
    expect(await readFixture(config, './fixtures/payment.json')).toEqual(bytes);
  });

  it.each([
    '../scenario-other/out',
    '..\\scenario-other\\out',
    '/outside/synthetic',
    'C:\\outside',
    'C:relative',
    '\\\\host\\share\\out',
    '\\\\?\\C:\\out',
    'fixtures/file:stream',
    'fixtures/NUL',
  ])('rejects unsafe fixture path %s', async (path) => {
    await expect(readFixture(config, path)).rejects.toThrow(
      /inside the scenario directory|relative file path|regular file/,
    );
  });

  it('refuses a junction resolving to a sibling with a common name prefix', async () => {
    const sibling = join(parent, 'scenario-other');
    await mkdir(sibling);
    await writeFile(join(sibling, 'payment.json'), 'outside');
    await symlink(sibling, join(scenario, 'external'), 'junction');
    await expect(readFixture(config, 'external/payment.json')).rejects.toThrow(
      /inside/,
    );
  });

  it('rejects directories and reports a typed error for missing files', async () => {
    await expect(readFixture(config, 'fixtures')).rejects.toThrow(
      /regular file/,
    );
    await expect(readFixture(config, 'missing.json')).rejects.toBeInstanceOf(
      FixtureError,
    );
  });

  it('accepts empty fixtures and the exact 1 MiB limit, then rejects one extra byte', async () => {
    const path = join(scenario, 'payload');
    for (const size of [0, 1024 * 1024]) {
      const bytes = Buffer.alloc(size, 0x61);
      await writeFile(path, bytes);
      expect((await readFixture(config, 'payload')).equals(bytes)).toBe(true);
    }
    await writeFile(path, Buffer.alloc(1024 * 1024 + 1));
    await expect(readFixture(config, 'payload')).rejects.toThrow(/1 MiB/);
  });
});
