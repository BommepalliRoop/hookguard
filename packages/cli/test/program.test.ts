import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/program.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

describe('hookguard CLI', () => {
  it.each([[], ['-h'], ['--help']].map((args) => ({ args })))(
    'prints help for $args',
    async ({ args }) => {
      const writeOut = vi.fn();
      const writeErr = vi.fn();

      expect(await runCli(args, { writeOut, writeErr })).toBe(0);
      expect(writeOut).toHaveBeenCalledWith(
        expect.stringContaining('Usage: hookguard'),
      );
      expect(writeErr).not.toHaveBeenCalled();
    },
  );

  it('prints the workspace CLI version', async () => {
    const writeOut = vi.fn();
    const writeErr = vi.fn();

    expect(await runCli(['--version'], { writeOut, writeErr })).toBe(0);
    expect(writeOut).toHaveBeenCalledExactlyOnceWith(`${version}\n`);
    expect(writeErr).not.toHaveBeenCalled();
  });

  it.each([
    ['--unknown', 'unknown option'],
    ['unknown-command', 'unknown command'],
  ])('returns the usage exit code for %s', async (arg, message) => {
    const writeOut = vi.fn();
    const writeErr = vi.fn();

    expect(await runCli([arg], { writeOut, writeErr })).toBe(2);
    expect(writeErr).toHaveBeenCalledWith(expect.stringContaining(message));
    expect(writeOut).not.toHaveBeenCalled();
  });
  it.each([
    ['--bad\x1b[31m', '--bad\\u001b[31m'],
    ['--bad\nforged', '--bad\\u000aforged'],
    ['--bad\x9b2J', '--bad\\u009b2J'],
  ])('escapes terminal controls in usage diagnostics', async (arg, escaped) => {
    const writeOut = vi.fn();
    const writeErr = vi.fn();
    expect(await runCli([arg], { writeOut, writeErr })).toBe(2);
    expect(writeErr).toHaveBeenCalledWith(
      `error: unknown option '${escaped}'\n`,
    );
    expect(writeErr.mock.calls.flat().join('')).not.toContain(arg);
    expect(writeErr).toHaveBeenCalledWith(
      expect.stringContaining('Usage: hookguard'),
    );
    expect(writeOut).not.toHaveBeenCalled();
  });

  it('validates the synthetic duplicate scenario and fixture offline', async () => {
    const path = fileURLToPath(
      new URL('../../../examples/scenarios/duplicate.yaml', import.meta.url),
    );
    const writeOut = vi.fn();
    const writeErr = vi.fn();
    expect(await runCli(['validate', '-c', path], { writeOut, writeErr })).toBe(
      0,
    );
    expect(writeOut).toHaveBeenCalledWith('Scenario configuration is valid.\n');
    expect(writeErr).not.toHaveBeenCalled();
  });

  it('returns a configuration error for an unsupported scenario version', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hookguard-cli-'));
    try {
      const path = join(directory, 'unsupported.yaml');
      await writeFile(path, 'version: 9\n');
      const writeOut = vi.fn();
      const writeErr = vi.fn();
      expect(
        await runCli(['validate', '--config', path], { writeOut, writeErr }),
      ).toBe(2);
      expect(writeErr).toHaveBeenCalledWith(expect.stringContaining('version'));
      expect(writeOut).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});

it('rejects an unknown report format before running a scenario', async () => {
  const writeOut = vi.fn();
  const writeErr = vi.fn();
  expect(
    await runCli(
      ['run', '--target', 'http://127.0.0.1:3000', '--format', 'csv'],
      { writeOut, writeErr },
    ),
  ).toBe(2);
  expect(writeErr).toHaveBeenCalledWith(expect.stringContaining('--format'));
  expect(writeOut).not.toHaveBeenCalled();
});

it('returns the target policy exit code and never writes a partial report', async () => {
  const config = fileURLToPath(
    new URL('../../../examples/scenarios/duplicate.yaml', import.meta.url),
  );
  const writeOut = vi.fn();
  const writeErr = vi.fn();
  expect(
    await runCli(
      [
        'run',
        '-c',
        config,
        '--target',
        'http://127.0.0.1:3001',
        '--format',
        'json',
      ],
      { writeOut, writeErr },
    ),
  ).toBe(3);
  expect(writeErr).toHaveBeenCalledWith(
    expect.stringContaining('Target rejected'),
  );
  expect(writeOut).not.toHaveBeenCalled();
});

it('returns a generic runtime diagnostic when writing output fails', async () => {
  const config = fileURLToPath(
    new URL('../../../examples/scenarios/duplicate.yaml', import.meta.url),
  );
  const writeErr = vi.fn();
  expect(
    await runCli(['validate', '-c', config], {
      writeOut: () => {
        throw new Error('synthetic-private-error');
      },
      writeErr,
    }),
  ).toBe(4);
  expect(writeErr).toHaveBeenCalledExactlyOnceWith(
    'An unexpected HookGuard error occurred.\n',
  );
});
