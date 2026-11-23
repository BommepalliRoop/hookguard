import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createState,
  loadConfig,
  loadState,
  markBlocked,
  nextAssignments,
  recover,
  saveState,
} from './queue.mjs';

let directory;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hookguard-queue-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function task(id, overrides = {}) {
  return {
    id,
    phase: 1,
    dependsOn: [],
    paths: [id],
    role: 'routine',
    prompt: 'Complete the scoped task.',
    checks: [{ command: 'node', args: ['--test'] }],
    ...overrides,
  };
}

function config(tasks = [task('task-a')]) {
  return {
    version: 1,
    workers: ['worker-1', 'worker-2', 'worker-3', 'worker-4'],
    limits: {
      timeoutMs: 15_000,
      maxOutputBytes: 2_000,
      maxAttempts: 2,
      retryBaseMs: 25,
    },
    models: {
      routine: ['gpt-6.2-sol'],
      review: ['gpt-6.2-astra', 'gpt-6.2-sol'],
    },
    tasks,
  };
}

async function readConfig(value) {
  const file = join(directory, 'tasks.json');
  await writeFile(file, JSON.stringify(value));
  return loadConfig(file);
}

function assignmentIds(assignments) {
  return assignments.map(({ task, workerId }) => [task.id, workerId]);
}

describe('queue config', () => {
  it('requires at least one worker verification command', async () => {
    await expect(
      readConfig(config([task('task-a', { checks: [] })])),
    ).rejects.toThrow('checks must be a nonempty array');
  });

  it('keeps check arguments and human-readable prompts intact', async () => {
    const value = config([
      task('task-a', {
        prompt: 'Run this check.\nPreserve literal code.',
        checks: [
          {
            command: 'node',
            args: ['-e', 'let value = 1; value += 2', '$literal'],
          },
        ],
      }),
    ]);
    await expect(readConfig(value)).resolves.toEqual(value);
  });

  it.each([
    '../outside',
    'scripts/../outside',
    'scripts/./queue.mjs',
    'scripts//queue.mjs',
    'C:/Windows',
    '/absolute',
    'docs\\outside',
    '.Git/config',
    'docs/AUX.txt',
    'docs/path.',
    'docs/path ',
    'docs/file.txt:stream',
  ])('rejects unsafe path %s', async (path) => {
    await expect(
      readConfig(config([task('task-a', { paths: [path] })])),
    ).rejects.toThrow('.paths');
  });

  it('rejects case aliases and duplicate worker identifiers', async () => {
    await expect(
      readConfig(
        config([task('task-a', { paths: ['docs/PLAN', 'docs/plan'] })]),
      ),
    ).rejects.toThrow('equivalent paths');
    await expect(
      readConfig({ ...config(), workers: ['worker-1', 'worker-1'] }),
    ).rejects.toThrow('duplicates');
  });

  it('enforces the worker cap and bounded run limits', async () => {
    const value = config();
    await expect(
      readConfig({ ...value, workers: [...value.workers, 'worker-5'] }),
    ).rejects.toThrow('workers');
    await expect(
      readConfig({ ...value, limits: { ...value.limits, maxAttempts: 0 } }),
    ).rejects.toThrow('limits.maxAttempts');
    await expect(
      readConfig({
        ...value,
        limits: { ...value.limits, timeoutMs: 4_000_000 },
      }),
    ).rejects.toThrow('limits.timeoutMs');
  });

  it.each([
    [[task('task-a'), task('task-a')], 'duplicate IDs'],
    [[task('task-a', { dependsOn: ['missing'] })], 'unknown task missing'],
    [[task('task-a', { dependsOn: ['task-a'] })], 'dependency cycle'],
    [
      [
        task('task-a', { dependsOn: ['task-b'] }),
        task('task-b', { dependsOn: ['task-c'] }),
        task('task-c', { dependsOn: ['task-a'] }),
      ],
      'dependency cycle',
    ],
    [
      [task('task-a', { dependsOn: ['task-b'] }), task('task-b', { phase: 2 })],
      'later-phase task task-b',
    ],
  ])('rejects an invalid dependency graph with %s', async (tasks, message) => {
    await expect(readConfig(config(tasks))).rejects.toThrow(message);
  });

  it('restricts check executable and argument type', async () => {
    await expect(
      readConfig(
        config([task('task-a', { checks: [{ command: 'pwsh', args: [] }] })]),
      ),
    ).rejects.toThrow('command must be node or pnpm');
    await expect(
      readConfig(
        config([
          task('task-a', { checks: [{ command: 'pnpm', args: [null] }] }),
        ]),
      ),
    ).rejects.toThrow('args must be an array of strings');
  });
});

describe('queue scheduling', () => {
  it('assigns by phase, readiness, path conflicts, and available workers', () => {
    const value = config([
      task('later', { phase: 2 }),
      task('child', { paths: ['docs/design.md'] }),
      task('parent', { paths: ['Docs'] }),
      task('prefix-neighbor', { paths: ['docs-old'] }),
      task('dependent', { dependsOn: ['child'] }),
      task('running', { paths: ['packages/cli/src'] }),
      task('overlapping', { paths: ['packages/CLI'] }),
      task('free'),
      task('extra'),
    ]);
    const state = createState(value, 'base');
    state.tasks.running.status = 'running';
    state.tasks.running.owner = 'worker-2';

    expect(assignmentIds(nextAssignments(value, state))).toEqual([
      ['child', 'worker-1'],
      ['prefix-neighbor', 'worker-3'],
      ['free', 'worker-4'],
    ]);
    expect(state.tasks.child.status).toBe('queued');

    Object.assign(state.tasks.child, { status: 'completed' });
    expect(assignmentIds(nextAssignments(value, state))).toEqual([
      ['parent', 'worker-1'],
      ['prefix-neighbor', 'worker-3'],
      ['dependent', 'worker-4'],
    ]);
  });

  it('releases the next phase once the prior phase fully succeeds', () => {
    const value = config([task('later', { phase: 2 }), task('first')]);
    const state = createState(value, 'base');
    state.tasks.first.status = 'completed';
    expect(assignmentIds(nextAssignments(value, state))).toEqual([
      ['later', 'worker-1'],
    ]);
    state.tasks.later.status = 'completed';
    expect(nextAssignments(value, state)).toEqual([]);
  });

  it('blocks later phases and transitive dependents after a failed gate', () => {
    const value = config([
      task('later', { phase: 2 }),
      task('transitive', { dependsOn: ['direct'] }),
      task('direct', { dependsOn: ['failed'] }),
      task('failed'),
      task('independent'),
    ]);
    const state = createState(value, 'base');
    state.tasks.failed.status = 'failed';
    expect(markBlocked(value, state)).toBe(true);
    expect(markBlocked(value, state)).toBe(false);
    expect(state.tasks.direct.result).toEqual({
      reason: 'dependency_failed',
      dependency: 'failed',
    });
    expect(state.tasks.transitive).toMatchObject({
      status: 'blocked',
      owner: null,
      retryAt: null,
    });
    expect(state.tasks.later.result).toEqual({
      reason: 'phase_failed',
      phase: 1,
    });
    expect(assignmentIds(nextAssignments(value, state))).toEqual([
      ['independent', 'worker-1'],
    ]);
    state.tasks.independent.status = 'completed';
    expect(nextAssignments(value, state)).toEqual([]);
  });

  it('recovers interrupted workers within the persisted attempt budget', () => {
    const value = config([task('retry'), task('exhausted')]);
    const state = createState(value, 'base');
    Object.assign(state.tasks.retry, {
      status: 'running',
      owner: 'worker-1',
      attempts: [{ number: 1 }],
    });
    Object.assign(state.tasks.exhausted, {
      status: 'running',
      owner: 'worker-2',
      attempts: [{ number: 1 }, { number: 2 }],
    });

    expect(recover(state, value, 100)).toBe(true);
    expect(recover(state, value, 100)).toBe(false);
    expect(state.tasks.retry).toEqual({
      status: 'retry_wait',
      owner: null,
      attempts: [{ number: 1 }],
      result: { reason: 'interrupted' },
      retryAt: 125,
    });
    expect(state.tasks.exhausted).toMatchObject({
      status: 'failed',
      owner: null,
      attempts: [{ number: 1 }, { number: 2 }],
      result: { reason: 'interrupted' },
      retryAt: null,
    });
    expect(nextAssignments(value, state, 124)).toEqual([]);
    expect(assignmentIds(nextAssignments(value, state, 125))).toEqual([
      ['retry', 'worker-1'],
    ]);
  });
});

describe('queue checkpoints', () => {
  it('round trips and replaces an existing checkpoint', async () => {
    const value = config();
    const state = createState(value, 'base');
    const file = join(directory, 'nested', 'checkpoint.json');
    await expect(loadState(file, value)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await saveState(file, state);
    await expect(loadState(file, value)).resolves.toEqual(state);
    state.tasks['task-a'].status = 'completed';
    await saveState(file, state);
    await expect(loadState(file, value)).resolves.toEqual(state);
    await expect(readdir(join(directory, 'nested'))).resolves.toEqual([
      'checkpoint.json',
    ]);
  });

  it('rejects incompatible configuration and invalid task state', async () => {
    const value = config();
    const state = createState(value, 'base');
    const file = join(directory, 'checkpoint.json');
    await saveState(file, state);
    await expect(loadState(file, config([task('task-b')]))).rejects.toThrow(
      'does not match the config',
    );
    state.tasks['task-a'].status = 'running';
    await saveState(file, state);
    await expect(loadState(file, value)).rejects.toThrow('.owner is invalid');
    state.tasks['task-a'].owner = 'worker-1';
    await saveState(file, state);
    await expect(loadState(file, value)).resolves.toEqual(state);
  });

  it('cleans up its temporary file when a checkpoint cannot be replaced', async () => {
    const value = config();
    const file = join(directory, 'checkpoint.json');
    await mkdir(file);
    await expect(saveState(file, createState(value, 'base'))).rejects.toThrow();
    await expect(readdir(directory)).resolves.toEqual(['checkpoint.json']);
    await expect(readdir(file)).resolves.toEqual([]);
  });
});
