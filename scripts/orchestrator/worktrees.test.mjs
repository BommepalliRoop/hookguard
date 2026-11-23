import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'vitest';
import {
  commitWork,
  git,
  inspectWork,
  prepareReview,
  prepareWorktree,
} from './worktrees.mjs';

async function fixture(t) {
  const temp = await mkdtemp(join(tmpdir(), 'hookguard-worktrees-'));
  t.onTestFinished(async () => {
    if (resolve(temp).startsWith(resolve(tmpdir(), 'hookguard-worktrees-'))) {
      await rm(temp, { recursive: true, force: true });
    }
  });
  const repoRoot = join(temp, 'repo');
  const runDirectory = join(temp, 'run');
  await mkdir(repoRoot);
  await mkdir(runDirectory);
  await git(repoRoot, ['init', '-b', 'main']);
  await git(repoRoot, ['config', 'core.autocrlf', 'false']);
  await writeFile(join(repoRoot, '.gitignore'), '*.ignored\n');
  await git(repoRoot, ['add', '.gitignore']);
  await git(repoRoot, ['commit', '-m', 'initial']);
  return {
    repoRoot,
    runDirectory,
    runId: 'run-01',
    taskId: 'worker',
    attempt: 1,
    baseSha: await git(repoRoot, ['rev-parse', 'HEAD']),
  };
}

const task = { id: 'worker', paths: ['src', 'test/'] };

async function changes(directory) {
  await mkdir(join(directory, 'src'));
  await mkdir(join(directory, 'test'));
  await writeFile(
    join(directory, 'src', 'some [code].mjs'),
    'export const answer = 42;\n',
  );
  await writeFile(
    join(directory, 'test', 'worker.test.mjs'),
    'import "node:test";\n',
  );
}

test(
  'builds a review candidate from verified worker commits without changing main',
  { timeout: 120000 },
  async (t) => {
    const options = await fixture(t);
    const worker = await prepareWorktree(options);
    await changes(worker.directory);
    const first = await commitWork({ ...worker, task });
    assert.deepEqual(first.files, [
      'src/some [code].mjs',
      'test/worker.test.mjs',
    ]);
    const next = await prepareWorktree({
      ...options,
      attempt: 2,
      dependencyCommits: [first.commit],
    });
    assert.equal(
      await readFile(join(next.directory, first.files[0]), 'utf8'),
      'export const answer = 42;\n',
    );
    await rm(join(next.directory, first.files[0]));
    await writeFile(
      join(next.directory, first.files[1]),
      'import assert from "node:assert";\n',
    );
    const second = await commitWork({ ...next, task });
    assert.deepEqual(second.files, first.files);
    const review = await prepareReview({
      ...options,
      commits: [first.commit, second.commit],
    });
    assert.equal(
      await git(review.directory, ['rev-parse', 'HEAD^{tree}']),
      await git(next.directory, ['rev-parse', 'HEAD^{tree}']),
    );
    assert.equal(
      await git(options.repoRoot, ['rev-parse', 'HEAD']),
      options.baseSha,
    );
    assert.equal(await git(options.repoRoot, ['status', '--porcelain']), '');
  },
);

test(
  'rejects traversal, option-like refs, stale attempts and changed HEAD',
  { timeout: 120000 },
  async (t) => {
    const options = await fixture(t);
    for (const input of [
      { taskId: '../outside' },
      { runId: '../outside' },
      { baseSha: '--all' },
      { dependencyCommits: ['main'] },
    ]) {
      await assert.rejects(async () =>
        prepareWorktree({ ...options, ...input }),
      );
    }
    const worker = await prepareWorktree(options);
    await assert.rejects(prepareWorktree(options));
    await changes(worker.directory);
    await git(worker.directory, [
      'commit',
      '--allow-empty',
      '-m',
      'unexpected',
    ]);
    await assert.rejects(commitWork({ ...worker, task }), /HEAD/);
  },
);

test(
  'requires code and tests, rejects scope siblings and forced ignored files',
  { timeout: 120000 },
  async (t) => {
    const worker = await prepareWorktree(await fixture(t));
    const args = { ...worker, task };
    await assert.rejects(inspectWork(args), /Expected code/);
    await changes(worker.directory);
    await writeFile(join(worker.directory, 'src-old.mjs'), 'x');
    await assert.rejects(commitWork(args), /Outside task scope/);
    await rm(join(worker.directory, 'src-old.mjs'));
    const file = 'src/private.ignored';
    await writeFile(join(worker.directory, file), 'x');
    await git(worker.directory, ['add', '-f', '--', file]);
    await assert.rejects(commitWork(args), /Ignored path/);
    assert.equal(
      await git(worker.directory, ['rev-parse', 'HEAD']),
      worker.startSha,
    );
  },
);

test(
  'rejects staged symlink modes without filesystem symlink privileges',
  { timeout: 120000 },
  async (t) => {
    const worker = await prepareWorktree(await fixture(t));
    await changes(worker.directory);
    const file = 'src/some [code].mjs';
    const blob = await git(worker.directory, ['hash-object', '-w', '--', file]);
    await git(worker.directory, [
      'update-index',
      '--add',
      '--cacheinfo',
      '120000',
      blob,
      file,
    ]);
    await assert.rejects(
      commitWork({ ...worker, task }),
      /Unsupported Git file mode/,
    );
  },
);
