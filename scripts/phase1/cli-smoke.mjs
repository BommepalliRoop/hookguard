import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';

const rejectedOption = '--hookguard-smoke-invalid-option';

export function checkCli(executable, version) {
  const cases = [
    {
      arg: '--help',
      exitCode: 0,
      validate: (stdout, stderr) =>
        /^Usage: hookguard(?:\s|$)/u.test(stdout) && stderr === '',
      expectation: 'HookGuard usage on stdout and empty stderr',
    },
    {
      arg: '--version',
      exitCode: 0,
      validate: (stdout, stderr) => stdout === version && stderr === '',
      expectation: `the package version (${version}) on stdout and empty stderr`,
    },
    {
      arg: rejectedOption,
      exitCode: 2,
      validate: (stdout, stderr) =>
        stdout === '' &&
        stderr.includes(`error: unknown option '${rejectedOption}'`),
      expectation: 'an unknown-option diagnostic on stderr and empty stdout',
    },
  ];

  for (const { arg, exitCode, validate, expectation } of cases) {
    const result = spawnSync(process.execPath, [executable, arg], {
      encoding: 'utf8',
      timeout: 10_000,
      windowsHide: true,
    });
    if (result.error) throw new Error(`${arg}: ${result.error.message}`);
    if (result.status !== exitCode) {
      throw new Error(
        `${arg}: expected exit ${exitCode}, received ${result.signal ?? result.status}`,
      );
    }
    if (!validate(result.stdout.trim(), result.stderr.trim())) {
      throw new Error(`${arg}: expected ${expectation}`);
    }
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    const manifest = new URL(
      '../../packages/cli/package.json',
      import.meta.url,
    );
    const { bin, version } = JSON.parse(readFileSync(manifest, 'utf8'));
    checkCli(fileURLToPath(new URL(bin.hookguard, manifest)), version);
    process.stdout.write(
      'Built CLI passed help, version, and rejected-usage checks.\n',
    );
  } catch (error) {
    process.stderr.write(`CLI smoke check failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
