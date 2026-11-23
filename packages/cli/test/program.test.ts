import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/program.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

describe('hookguard CLI', () => {
  it.each([[], ['-h'], ['--help']].map((args) => ({ args })))(
    'prints help for $args',
    ({ args }) => {
      const writeOut = vi.fn();
      const writeErr = vi.fn();

      expect(runCli(args, { writeOut, writeErr })).toBe(0);
      expect(writeOut).toHaveBeenCalledWith(
        expect.stringContaining('Usage: hookguard'),
      );
      expect(writeErr).not.toHaveBeenCalled();
    },
  );

  it('prints the workspace CLI version', () => {
    const writeOut = vi.fn();
    const writeErr = vi.fn();

    expect(runCli(['--version'], { writeOut, writeErr })).toBe(0);
    expect(writeOut).toHaveBeenCalledExactlyOnceWith(`${version}\n`);
    expect(writeErr).not.toHaveBeenCalled();
  });

  it.each([
    ['--unknown', 'unknown option'],
    ['unknown-command', 'too many arguments'],
  ])('returns the usage exit code for %s', (arg, message) => {
    const writeOut = vi.fn();
    const writeErr = vi.fn();

    expect(runCli([arg], { writeOut, writeErr })).toBe(2);
    expect(writeErr).toHaveBeenCalledWith(expect.stringContaining(message));
    expect(writeOut).not.toHaveBeenCalled();
  });
  it.each([
    ['--bad\x1b[31m', '--bad\\u001b[31m'],
    ['--bad\nforged', '--bad\\u000aforged'],
    ['--bad\x9b2J', '--bad\\u009b2J'],
  ])('escapes terminal controls in usage diagnostics', (arg, escaped) => {
    const writeOut = vi.fn();
    const writeErr = vi.fn();
    expect(runCli([arg], { writeOut, writeErr })).toBe(2);
    expect(writeErr).toHaveBeenCalledWith(
      `error: unknown option '${escaped}'\n`,
    );
    expect(writeErr.mock.calls.flat().join('')).not.toContain(arg);
    expect(writeErr).toHaveBeenCalledWith(
      expect.stringContaining('Usage: hookguard'),
    );
    expect(writeOut).not.toHaveBeenCalled();
  });
});
