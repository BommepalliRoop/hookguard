import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkWorkspace } from './check-workspace.mjs';

const run = promisify(execFile);
const sourceScript = fileURLToPath(
  new URL('./check-workspace.mjs', import.meta.url),
);
const base = { compilerOptions: { strict: true } };
const build = { extends: '../../tsconfig.base.json' };

let workspace;

async function writeFixture(file, value) {
  const target = join(workspace, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(value));
}

async function addPackage(name, manifest = { private: true }, config = build) {
  await writeFixture(`packages/${name}/package.json`, manifest);
  await writeFixture(`packages/${name}/tsconfig.build.json`, config);
}

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'hookguard-workspace-check-'));
  await writeFixture('tsconfig.base.json', base);
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('checkWorkspace', () => {
  it('accepts multiple private packages extending the strict base and ignores ordinary files', async () => {
    await addPackage('cli');
    await addPackage(
      'reporter',
      { private: true },
      { extends: './../../tsconfig.base.json' },
    );
    await writeFixture('packages/metadata.json', {});

    await expect(checkWorkspace(workspace)).resolves.toEqual([]);
  });

  it('reports failures for every package, including missing required config', async () => {
    await addPackage(
      'cli',
      { private: false },
      { extends: '../../tsconfig.json' },
    );
    await writeFixture('packages/reporter/package.json', { private: 'true' });

    await expect(checkWorkspace(workspace)).resolves.toEqual([
      'packages/cli/package.json: set private to true.',
      'packages/cli/tsconfig.build.json: extend ../../tsconfig.base.json directly.',
      'packages/reporter/package.json: set private to true.',
      'packages/reporter/tsconfig.build.json: could not read file (ENOENT).',
    ]);
  });

  it('rejects a non-strict base or a package that disables strict mode', async () => {
    await writeFixture('tsconfig.base.json', {
      compilerOptions: { strict: false },
    });
    await addPackage(
      'cli',
      { private: true },
      { ...build, compilerOptions: { strict: false } },
    );

    await expect(checkWorkspace(workspace)).resolves.toEqual([
      'tsconfig.base.json: set compilerOptions.strict to true.',
      'packages/cli/tsconfig.build.json: compilerOptions must preserve strict mode.',
    ]);
  });

  it('reports a malformed manifest without skipping that package build config', async () => {
    await addPackage('cli', { private: true }, null);
    await writeFile(
      join(workspace, 'packages/cli/package.json'),
      '{"private":',
    );

    await expect(checkWorkspace(workspace)).resolves.toEqual([
      'packages/cli/package.json: expected a JSON object.',
      'packages/cli/tsconfig.build.json: expected a JSON object.',
    ]);
  });

  it('reports a workspace with no package directories', async () => {
    await writeFixture('packages/metadata.json', {});

    await expect(checkWorkspace(workspace)).resolves.toEqual([
      'packages: expected at least one workspace package directory.',
    ]);
  });
});

describe('workspace check command', () => {
  async function runFixture() {
    const fixtureScript = join(workspace, 'scripts/phase1/check-workspace.mjs');
    await mkdir(dirname(fixtureScript), { recursive: true });
    await copyFile(sourceScript, fixtureScript);
    return run(process.execPath, [fixtureScript], { cwd: tmpdir() });
  }

  it('exits successfully after locating the workspace relative to the script', async () => {
    await addPackage('cli');
    await expect(runFixture()).resolves.toMatchObject({
      stdout: 'Workspace package configuration is valid.\n',
      stderr: '',
    });
  });

  it('exits with code 1 and writes diagnostics to stderr for invalid packages', async () => {
    await addPackage('cli', {});
    await expect(runFixture()).rejects.toMatchObject({
      code: 1,
      stdout: '',
      stderr: 'packages/cli/package.json: set private to true.\n',
    });
  });
});
