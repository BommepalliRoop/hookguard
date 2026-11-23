import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename } from 'node:path';
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
  runResultSchema,
} from '@hookguard/schema';
import {
  Command,
  CommanderError,
  Option,
  type OutputConfiguration,
} from 'commander';
import {
  redactRunResult,
  renderJsonReport,
  renderJunitReport,
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
    .option('--json <file>', 'Write a JSON report to a new file')
    .option('--junit <file>', 'Write a JUnit report to a new file')
    .action(
      async ({
        config,
        target,
        json,
        junit,
      }: {
        config: string;
        target: string;
        json?: string;
        junit?: string;
      }) => {
        const scenario = await loadScenario(config);
        const fixture = await readFixture(config, scenario.fixture.path);
        const signature = scenario.security.signature;
        const signingSecret = signature
          ? process.env[signature.secretEnv]
          : undefined;
        const result = await runScenario(
          scenario,
          fixture,
          target,
          signingSecret === undefined ? {} : { signingSecret },
        );
        const redaction = {
          redactPaths: scenario.security.redactPaths,
          secrets: signingSecret ? [signingSecret] : [],
        };
        if (json)
          await writeFile(json, renderJsonReport(result, redaction), {
            flag: 'wx',
          });
        if (junit)
          await writeFile(junit, renderJunitReport(result, redaction), {
            flag: 'wx',
          });
        const summary = redactRunResult(result, redaction);
        writeOut(
          `${summary.passed ? 'PASS' : 'FAIL'} · ${summary.attempts.length} delivery attempts\n`,
        );
        for (const { kind, passed, detail } of summary.assertions) {
          writeOut(
            `${passed ? 'PASS' : 'FAIL'} ${escapeDiagnostic(kind)} · ${escapeDiagnostic(detail)}\n`,
          );
        }
        outcome = result.passed ? 0 : 1;
      },
    );

  program
    .command('report')
    .description('Convert an existing local JSON result')
    .requiredOption('--input <file>', 'Input HookGuard JSON result')
    .addOption(
      new Option('--format <format>', 'Output format')
        .choices(['json', 'junit'])
        .default('junit'),
    )
    .action(
      async ({
        input,
        format,
      }: {
        input: string;
        format: 'json' | 'junit';
      }) => {
        if (/^[\\/]{2}/u.test(input)) {
          throw new ConfigError([
            { path: '$', message: 'requires a local report file' },
          ]);
        }
        const bytes = await readFixture(input, basename(input));
        let value: unknown;
        try {
          value = JSON.parse(bytes.toString('utf8'));
        } catch {
          throw new ConfigError([
            { path: '$', message: 'has invalid report JSON' },
          ]);
        }
        const result = runResultSchema.safeParse(value);
        if (!result.success) {
          throw new ConfigError([
            { path: '$', message: 'is not a version 1 HookGuard result' },
          ]);
        }
        writeOut(
          format === 'json'
            ? renderJsonReport(result.data)
            : renderJunitReport(result.data),
        );
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
