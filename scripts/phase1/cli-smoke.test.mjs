import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCli } from './cli-smoke.mjs';

function fixture(
  onTestFinished,
  { version = '1.2.3', rejectionStatus = 2, errorStream = 'stderr' } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), 'hookguard smoke '));
  onTestFinished(() =>
    rmSync(directory, { recursive: true, force: true, maxRetries: 5 }),
  );
  const executable = join(directory, 'synthetic CLI.mjs');
  writeFileSync(
    executable,
    `
    import process from 'node:process';
    const argument = process.argv[2];
    if (argument === '--help') {
      process.stdout.write('Usage: hookguard [options]\\n');
    } else if (argument === '--version') {
      process.stdout.write(${JSON.stringify(version + '\n')});
    } else {
      process.${errorStream}.write("error: unknown option '" + argument + "'\\n");
      process.exitCode = ${rejectionStatus};
    }
  `,
  );
  return executable;
}

describe('built CLI contract', { timeout: 30_000 }, () => {
  it('accepts an executable that implements the expected CLI contract', ({
    onTestFinished,
  }) => {
    expect(() => checkCli(fixture(onTestFinished), '1.2.3')).not.toThrow();
  });

  it('rejects an executable that reports a stale version', ({
    onTestFinished,
  }) => {
    const executable = fixture(onTestFinished, { version: '1.2.2' });
    expect(() => checkCli(executable, '1.2.3')).toThrow(
      '--version: expected the package version',
    );
  });

  it('rejects an executable that returns success for an unknown option', ({
    onTestFinished,
  }) => {
    const executable = fixture(onTestFinished, { rejectionStatus: 0 });
    expect(() => checkCli(executable, '1.2.3')).toThrow(
      'expected exit 2, received 0',
    );
  });

  it('rejects an unknown-option diagnostic written to stdout', ({
    onTestFinished,
  }) => {
    const executable = fixture(onTestFinished, { errorStream: 'stdout' });
    expect(() => checkCli(executable, '1.2.3')).toThrow(
      'expected an unknown-option diagnostic on stderr',
    );
  });
});
