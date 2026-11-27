import { createRequire } from 'node:module';
import {
  DeliveryPlanError,
  runScenario,
  TargetPolicyError,
} from '@hookguard/engine';
import {
  ConfigError,
  FixtureError,
  loadScenario,
  readFixture,
} from '@hookguard/schema';
import {
  Command,
  CommanderError,
  Option,
  type OutputConfiguration,
} from 'commander';
import { InitError, initExpressTemplate } from './init.js';
import {
  formatJsonReport,
  formatJunitReport,
  redactRunResult,
  renderHtmlReport,
} from './report.js';

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
  let outcome = 0;

  program
    .command('init')
    .description('Create a synthetic Express scenario in a new local directory')
    .argument(
      '[directory]',
      'New directory for the scenario',
      'hookguard-example',
    )
    .addOption(
      new Option('--template <name>', 'Scenario template')
        .choices(['express'])
        .default('express'),
    )
    .action(async (directory: string) => {
      await initExpressTemplate(directory);
      writeOut(
        'Created hookguard.yaml and payment-captured.json.\n' +
          'Run hookguard validate --config with the path to the new hookguard.yaml.\n',
      );
    });

  program
    .command('validate')
    .description('Validate a local scenario and its fixture')
    .option('-c, --config <file>', 'Scenario YAML file', 'hookguard.yaml')
    .action(async ({ config }: { config: string }) => {
      const scenario = await loadScenario(config);
      await readFixture(config, scenario.fixture.path);
      writeOut('Scenario configuration is valid.\n');
    });

  program
    .command('run')
    .description(
      'Deliver a scenario to an explicitly allowed loopback endpoint',
    )
    .option('-c, --config <file>', 'Scenario YAML file', 'hookguard.yaml')
    .requiredOption('--target <url>', 'Webhook endpoint URL')
    .addOption(
      new Option('--format <format>', 'Report format')
        .choices(['text', 'json', 'junit', 'html'])
        .default('text'),
    )
    .action(
      async ({
        config,
        target,
        format,
      }: {
        config: string;
        target: string;
        format: 'text' | 'json' | 'junit' | 'html';
      }) => {
        const scenario = await loadScenario(config);
        const fixture = await readFixture(config, scenario.fixture.path);
        const signingSecret = process.env.HOOKGUARD_SIGNING_SECRET;
        const result = await runScenario(
          scenario,
          fixture,
          target,
          signingSecret === undefined ? {} : { signingSecret },
        );
        outcome = result.passed ? 0 : 1;
        const redaction = {
          redactPaths: scenario.security.redactPaths,
          secrets: signingSecret ? [signingSecret] : [],
        };
        if (format === 'json') {
          writeOut(formatJsonReport(result, redaction));
        } else if (format === 'junit') {
          writeOut(formatJunitReport(result, redaction));
        } else if (format === 'html') {
          writeOut(renderHtmlReport(result, redaction));
        } else {
          writeOut(
            `${result.passed ? 'PASS' : 'FAIL'} · ${result.attempts.length} delivery attempts\n`,
          );
          for (const { kind, passed, detail } of redactRunResult(
            result,
            redaction,
          ).assertions) {
            writeOut(`${passed ? 'PASS' : 'FAIL'} ${kind} · ${detail}\n`);
          }
        }
      },
    );

  try {
    if (args.length === 0) {
      program.outputHelp();
    } else {
      await program.parseAsync(args, { from: 'user' });
    }
    return outcome;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode === 0 ? 0 : 2;
    }
    if (
      error instanceof ConfigError ||
      error instanceof FixtureError ||
      error instanceof InitError ||
      error instanceof DeliveryPlanError
    ) {
      writeErr(`Configuration error: ${escapeDiagnostic(error.message)}\n`);
      return 2;
    }
    if (error instanceof TargetPolicyError) {
      writeErr(`Target rejected: ${escapeDiagnostic(error.message)}\n`);
      return 3;
    }
    writeErr('An unexpected HookGuard error occurred.\n');
    return 4;
  }
}
