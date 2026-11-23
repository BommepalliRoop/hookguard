import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, execPath } from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const entryPoint = fileURLToPath(new URL('./main.mjs', import.meta.url));

export function createFixture(onTestFinished) {
  const root = mkdtempSync(join(tmpdir(), 'hookguard-orchestrator-'));
  onTestFinished(() =>
    rmSync(root, { recursive: true, force: true, maxRetries: 5 }),
  );

  const repository = join(root, 'repo');
  const stateDir = join(root, 'state');
  const config = join(root, 'queue.json');
  const worker = join(root, 'worker.mjs');
  const hooks = join(root, 'hooks');
  mkdirSync(join(repository, 'src'), { recursive: true });
  mkdirSync(hooks);

  function git(...args) {
    return execFileSync('git', args, {
      cwd: repository,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }

  git('init', '--initial-branch=main');
  git('config', 'user.name', 'HookGuard test');
  git('config', 'user.email', 'hookguard-test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', hooks);
  writeFileSync(
    join(repository, 'src', 'baseline.mjs'),
    'export const baseline = true;\n',
  );
  git('add', '.');
  git('commit', '-m', 'Initial fixture');

  return {
    git,
    root,
    repository,
    writeConfig(tasks, limits = {}) {
      writeFileSync(
        config,
        JSON.stringify({
          version: 1,
          workers: ['worker-a', 'worker-b'],
          limits: {
            timeoutMs: 15_000,
            maxOutputBytes: 4096,
            maxAttempts: 2,
            retryBaseMs: 25,
            ...limits,
          },
          models: {
            routine: ['gpt-6.2-sol'],
            review: ['gpt-6.2-astra', 'gpt-6.2-sol'],
          },
          tasks,
        }),
      );
    },
    writeWorker(source) {
      writeFileSync(worker, source);
    },
    run() {
      const runEnv = { ...env };
      delete runEnv.NODE_V8_COVERAGE;
      const result = spawnSync(
        execPath,
        [
          entryPoint,
          'run',
          '--config',
          config,
          '--state-dir',
          stateDir,
          '--offline-worker',
          worker,
        ],
        {
          cwd: repository,
          encoding: 'utf8',
          env: runEnv,
          timeout: 40_000,
        },
      );
      if (result.error) throw result.error;
      return { status: result.status, output: result.stdout + result.stderr };
    },
    readState() {
      return JSON.parse(readFileSync(join(stateDir, 'state.json'), 'utf8'));
    },
    resultCommits() {
      const commits = git('rev-list', '--all', '--not', 'main');
      return commits ? commits.split(/\r?\n/u) : [];
    },
  };
}

export function makeTask(id, overrides = {}) {
  return {
    id,
    phase: 1,
    dependsOn: [],
    paths: [`src/${id}.mjs`, `src/${id}.test.mjs`],
    role: 'routine',
    prompt: `Implement and verify ${id}`,
    checks: [{ command: 'node', args: ['--test', `src/${id}.test.mjs`] }],
    ...overrides,
  };
}
