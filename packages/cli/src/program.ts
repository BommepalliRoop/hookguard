import { createRequire } from 'node:module';
import { Command, CommanderError, type OutputConfiguration } from 'commander';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

export function runCli(
  args: readonly string[],
  output: OutputConfiguration = {},
): number {
  const program = new Command()
    .name('hookguard')
    .description('Local-first reliability testing for webhook consumers')
    .version(version)
    .configureOutput(output)
    .showHelpAfterError()
    .exitOverride();

  try {
    if (args.length === 0) {
      program.outputHelp();
    } else {
      program.parse(args, { from: 'user' });
    }
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode === 0 ? 0 : 2;
    }
    throw error;
  }
}
