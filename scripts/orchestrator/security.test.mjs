import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { runQueue } from './main.mjs';
import { createState, loadConfig } from './queue.mjs';
import { createFixture, makeTask } from './test-fixture.mjs';

test('retains a native model candidate without executing generated checks on the host', async ({
  onTestFinished,
}) => {
  const fixture = createFixture(onTestFinished);
  const task = makeTask('candidate');
  const marker = join(fixture.root, 'check-ran');
  fixture.writeConfig([task]);
  const config = await loadConfig(join(fixture.root, 'queue.json'));
  const state = createState(config, fixture.git('rev-parse', 'HEAD'));
  const runDirectory = join(fixture.root, 'state');
  mkdirSync(runDirectory);
  await runQueue(
    {
      config,
      state,
      repoRoot: fixture.repository,
      runDirectory,
      runId: 'model-run',
      abort: new globalThis.AbortController(),
      checkpoint: async () => {},
    },
    undefined,
    { routine: 'fixture-model' },
    async (_command, _args, { cwd }) => {
      writeFileSync(
        join(cwd, task.paths[0]),
        'export const candidate = true;\n',
      );
      writeFileSync(
        join(cwd, task.paths[1]),
        `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'ran');\n`,
      );
      return { exitCode: 0, reason: null, outputBytes: 0, durationMs: 1 };
    },
  );
  const record = state.tasks.candidate;
  expect(record).toMatchObject({
    status: 'failed',
    result: { reason: 'candidate_review_required' },
    attempts: [{ outcome: 'candidate_review_required', checks: [] }],
  });
  expect(existsSync(join(record.attempts[0].directory, task.paths[0]))).toBe(
    true,
  );
  expect(existsSync(marker)).toBe(false);
  expect(fixture.resultCommits()).toEqual([]);
}, 120_000);

test('rejects an out-of-scope staged change from an otherwise successful worker', ({
  onTestFinished,
}) => {
  const fixture = createFixture(onTestFinished);
  const initialCommit = fixture.git('rev-parse', 'HEAD');
  fixture.writeConfig([makeTask('scoped')]);
  fixture.writeWorker(`
    import { execFileSync } from 'node:child_process';
    import { readFileSync, writeFileSync } from 'node:fs';
    const { task } = JSON.parse(readFileSync(0, 'utf8'));
    writeFileSync(task.paths[0], 'export const allowed = true;\\n');
    writeFileSync(task.paths[1],
      'import { equal } from "node:assert/strict";\\n' +
      'import { allowed } from "./scoped.mjs";\\n' +
      'equal(allowed, true);\\n');
    writeFileSync('src/baseline.mjs', 'export const baseline = false;\\n');
    execFileSync('git', ['add', '--', 'src/baseline.mjs']);
    writeFileSync(new URL('./staged.txt', import.meta.url),
      execFileSync('git', ['diff', '--cached', '--name-only']));
  `);

  const result = fixture.run();
  expect(result.status, result.output).toBe(1);
  expect(readFileSync(join(fixture.root, 'staged.txt'), 'utf8').trim()).toBe(
    'src/baseline.mjs',
  );
  expect(fixture.readState().tasks.scoped).toMatchObject({
    status: 'failed',
    result: { reason: 'invalid_work' },
    attempts: [{ outcome: 'invalid_work' }],
  });
  expect(fixture.resultCommits()).toEqual([]);
  expect(fixture.git('rev-parse', 'HEAD')).toBe(initialCommit);
  expect(fixture.git('diff', '--cached', '--name-only')).toBe('');
  expect(fixture.git('status', '--porcelain')).toBe('');
}, 120_000);

test('keeps a worker change out of result commits when its required check fails', ({
  onTestFinished,
}) => {
  const fixture = createFixture(onTestFinished);
  fixture.writeConfig([makeTask('failing-check')]);
  fixture.writeWorker(`
    import { readFileSync, writeFileSync } from 'node:fs';
    const { task } = JSON.parse(readFileSync(0, 'utf8'));
    writeFileSync(task.paths[0], 'export const value = 13;\\n');
    writeFileSync(task.paths[1],
      'import { equal } from "node:assert/strict";\\n' +
      'import { value } from "./failing-check.mjs";\\n' +
      'equal(value, 42);\\n');
  `);

  const result = fixture.run();
  expect(result.status, result.output).toBe(1);
  expect(fixture.readState().tasks['failing-check']).toMatchObject({
    status: 'failed',
  });
  expect(
    fixture.readState().tasks['failing-check'].attempts.at(-1).checks,
  ).toMatchObject([
    {
      command: 'node',
      args: ['--test', 'src/failing-check.test.mjs'],
      exitCode: 1,
    },
  ]);
  expect(fixture.resultCommits()).toEqual([]);
  expect(fixture.git('status', '--porcelain')).toBe('');
}, 120_000);
