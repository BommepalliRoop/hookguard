import { createRequire } from 'node:module';
import {
  ConfigError,
  FixtureError,
  loadScenario,
  readFixture,
} from '@hookguard/schema';
import { Command, CommanderError, type OutputConfiguration } from 'commander';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const terminalControl = /[\p{Cc}\p{Bidi_Control}\u2028\u2029]/gu;

function escapeDiagnostic(message: string): string {
  return message.replace(
    terminalControl,
    (character) =>
      '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}

function diagnosticOutput(
  args: readonly string[],
  output: OutputConfiguration,
): OutputConfiguration {
  if (!args.some((arg) => arg.search(terminalControl) !== -1)) return output;
  return {
    ...output,
    outputError(message, write) {
      // Commander appends one newline to each diagnostic and writes help separately.
      const escaped = escapeDiagnostic(message.trimEnd()) + '\n';
      if (output.outputError) output.outputError(escaped, write);
      else write(escaped);
    },
  };
}

export async function runCli(
  args: readonly string[],
  output: OutputConfiguration = {},
): Promise<number> {
  const program = new Command()
    .name('hookguard')
    .description('Local-first reliability testing for webhook consumers')
    .version(version)
    .configureOutput(diagnosticOutput(args, output))
    .showHelpAfterError()
    .exitOverride();
  const writeOut =
    output.writeOut ?? ((message: string) => process.stdout.write(message));
  const writeErr =
    output.writeErr ?? ((message: string) => process.stderr.write(message));

  program
    .command('validate')
    .description('Validate a local scenario and its fixture')
    .option('-c, --config <file>', 'Scenario YAML file', 'hookguard.yaml')
    .action(async ({ config }: { config: string }) => {
      const scenario = await loadScenario(config);
      await readFixture(config, scenario.fixture.path);
      writeOut('Scenario configuration is valid.\n');
    });

  try {
    if (args.length === 0) {
      program.outputHelp();
    } else {
      await program.parseAsync(args, { from: 'user' });
    }
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode === 0 ? 0 : 2;
    }
    if (error instanceof ConfigError || error instanceof FixtureError) {
      writeErr(`Configuration error: ${escapeDiagnostic(error.message)}\n`);
      return 2;
    }
    writeErr('An unexpected HookGuard error occurred.\n');
    return 4;
  }
}
