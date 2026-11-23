import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createFixture, makeTask } from './test-fixture.mjs';

test('runs checks in isolated worker worktrees, retries a transient exit, and resumes', ({
  onTestFinished,
}) => {
  const fixture = createFixture(onTestFinished);
  const initialCommit = fixture.git('rev-parse', 'HEAD');
  fixture.writeConfig([
    makeTask('prepare'),
    makeTask('verify', { dependsOn: ['prepare'], role: 'review' }),
  ]);
  fixture.writeWorker(`
    import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
    import { cwd, exit, pid } from 'node:process';
    import { fileURLToPath } from 'node:url';

    const { task, workerId, attempt, model } = JSON.parse(readFileSync(0, 'utf8'));
    const ledger = new URL('./worker-events.jsonl', import.meta.url);
    appendFileSync(ledger, JSON.stringify({ id: task.id, workerId, attempt, model, pid, cwd: cwd() }) + '\\n');
    const marker = new URL('./prepare-ready', import.meta.url);
    if (task.id === 'prepare' && attempt === 1) exit(75);
    if (task.id === 'verify' && (!existsSync(marker) || !existsSync('src/prepare.mjs'))) {
      throw new Error('The prepared dependency is missing after its required check');
    }

    writeFileSync(task.paths[0], 'export const value = 42;\\n');
    let check =
      'import { equal } from "node:assert/strict";\\n' +
      'import { value } from "./' + task.id + '.mjs";\\n' +
      'equal(value, 42);\\n';
    if (task.id === 'prepare') {
      check += 'import { writeFileSync } from "node:fs";\\n' +
        'writeFileSync(' + JSON.stringify(fileURLToPath(marker)) + ', "ready");\\n';
    }
    writeFileSync(task.paths[1], check);
  `);

  const firstRun = fixture.run();
  expect(firstRun.status, firstRun.output).toBe(0);
  const ledger = join(fixture.root, 'worker-events.jsonl');
  const ledgerBeforeResume = readFileSync(ledger, 'utf8');
  const invocations = ledgerBeforeResume
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line));
  expect(invocations).toMatchObject([
    { id: 'prepare', attempt: 1, model: 'offline' },
    { id: 'prepare', attempt: 2, model: 'offline' },
    { id: 'verify', attempt: 1, model: 'offline' },
  ]);
  for (const { cwd, pid, workerId } of invocations) {
    expect(cwd).not.toBe(fixture.repository);
    expect(pid).toBeGreaterThan(0);
    expect(['worker-a', 'worker-b']).toContain(workerId);
  }

  const checkpoint = fixture.readState();
  const taskCommits = Object.values(checkpoint.tasks).map(
    (task) => task.result.commit,
  );
  expect(new Set(taskCommits).size).toBe(2);
  const changedFiles = taskCommits.flatMap((commit) =>
    fixture
      .git('diff-tree', '--no-commit-id', '--name-only', '-r', commit)
      .split(/\r?\n/u),
  );
  expect(changedFiles.sort()).toEqual([
    'src/prepare.mjs',
    'src/prepare.test.mjs',
    'src/verify.mjs',
    'src/verify.test.mjs',
  ]);
  expect(fixture.git('rev-parse', 'HEAD')).toBe(initialCommit);
  expect(fixture.git('status', '--porcelain')).toBe('');

  for (const invocation of invocations) {
    const task = checkpoint.tasks[invocation.id];
    expect(task.status).toBe('completed');
    expect(task.owner).toBeNull();
    expect(task.attempts[invocation.attempt - 1]).toMatchObject({
      number: invocation.attempt,
      workerId: invocation.workerId,
      model: invocation.model,
      pid: invocation.pid,
    });
  }
  for (const [id, task] of Object.entries(checkpoint.tasks)) {
    const attempt = task.attempts.at(-1);
    expect(fixture.git('rev-parse', attempt.branch)).toBe(task.result.commit);
    expect(attempt.checks).toMatchObject([
      { command: 'node', args: ['--test', `src/${id}.test.mjs`], exitCode: 0 },
    ]);
  }
  const resultCommits = fixture.resultCommits();
  const resumedRun = fixture.run();
  expect(resumedRun.status, resumedRun.output).toBe(0);
  expect(readFileSync(ledger, 'utf8')).toBe(ledgerBeforeResume);
  expect(fixture.resultCommits()).toEqual(resultCommits);
  expect(fixture.readState().tasks).toEqual(checkpoint.tasks);
}, 120_000);

test('assigns independent tasks to two workers at the same time', ({
  onTestFinished,
}) => {
  const fixture = createFixture(onTestFinished);
  fixture.writeConfig([makeTask('left'), makeTask('right')]);
  fixture.writeWorker(`
    import { existsSync, readFileSync, writeFileSync } from 'node:fs';
    import { setTimeout } from 'node:timers/promises';

    const { task, workerId } = JSON.parse(readFileSync(0, 'utf8'));
    const ownMarker = new URL('./start-' + task.id, import.meta.url);
    const otherId = task.id === 'left' ? 'right' : 'left';
    const otherMarker = new URL('./start-' + otherId, import.meta.url);
    writeFileSync(ownMarker, workerId);
    const deadline = Date.now() + 8000;
    while (!existsSync(otherMarker)) {
      if (Date.now() >= deadline) throw new Error('The other worker never ran concurrently');
      await setTimeout(25);
    }
    writeFileSync(task.paths[0], 'export const value = 42;\\n');
    writeFileSync(task.paths[1],
      'import { equal } from "node:assert/strict";\\n' +
      'import { value } from "./' + task.id + '.mjs";\\n' +
      'equal(value, 42);\\n');
  `);

  const result = fixture.run();
  expect(result.status, result.output).toBe(0);
  const { tasks } = fixture.readState();
  expect(tasks.left.status).toBe('completed');
  expect(tasks.right.status).toBe('completed');
  expect(
    [tasks.left.attempts[0].workerId, tasks.right.attempts[0].workerId].sort(),
  ).toEqual(['worker-a', 'worker-b']);
  expect(tasks.left.attempts[0].directory).not.toBe(
    tasks.right.attempts[0].directory,
  );
  expect(fixture.resultCommits()).toHaveLength(2);
  expect(fixture.git('status', '--porcelain')).toBe('');
}, 120_000);

test('terminates a worker that exceeds its time limit', ({
  onTestFinished,
}) => {
  const fixture = createFixture(onTestFinished);
  fixture.writeConfig([makeTask('timeout')], {
    timeoutMs: 2000,
    maxAttempts: 1,
  });
  fixture.writeWorker(`
    import { readFileSync, writeFileSync } from 'node:fs';
    readFileSync(0, 'utf8');
    writeFileSync(new URL('./worker-started', import.meta.url), 'started');
    setInterval(() => {}, 1000);
  `);

  const result = fixture.run();
  expect(result.status, result.output).toBe(1);
  expect(existsSync(join(fixture.root, 'worker-started'))).toBe(true);
  expect(fixture.readState().tasks.timeout).toMatchObject({
    status: 'failed',
    owner: null,
    attempts: [{ outcome: 'timeout' }],
  });
  expect(fixture.resultCommits()).toEqual([]);
  expect(fixture.git('status', '--porcelain')).toBe('');
}, 120_000);
