import { createRequire } from 'node:module';
import { Command, CommanderError, type OutputConfiguration } from 'commander';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const terminalControl = /[\p{Cc}\p{Bidi_Control}\u2028\u2029]/gu;

function diagnosticOutput(
  args: readonly string[],
  output: OutputConfiguration,
): OutputConfiguration {
  if (!args.some((arg) => arg.search(terminalControl) !== -1)) return output;
  return {
    ...output,
    outputError(message, write) {
      // Commander appends one newline to each diagnostic and writes help separately.
      const escaped =
        message
          .slice(0, -1)
          .replace(
            terminalControl,
            (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'),
          ) + '\n';
      if (output.outputError) output.outputError(escaped, write);
      else write(escaped);
    },
  };
}

export function runCli(
  args: readonly string[],
  output: OutputConfiguration = {},
): number {
  const program = new Command()
    .name('hookguard')
    .description('Local-first reliability testing for webhook consumers')
    .version(version)
    .configureOutput(diagnosticOutput(args, output))
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
