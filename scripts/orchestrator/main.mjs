import { createHash } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  realpath,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { hostname } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import {
  chatGptEnvironment,
  checkCommand,
  classifyWorker,
  runProcess,
} from './process.mjs';
import {
  createState,
  loadConfig,
  loadState,
  markBlocked,
  nextAssignments,
  recover,
  saveState,
} from './queue.mjs';
import {
  commitWork,
  git,
  inspectWork,
  prepareReview,
  prepareWorktree,
} from './worktrees.mjs';

function print(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function contains(directory, path) {
  const suffix = relative(directory, path);
  return (
    suffix === '' ||
    (suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix))
  );
}

function live(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1)
    throw new Error('Invalid PID in local checkpoint');
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    return false;
  }
}

async function acquireLock(directory, allowRecovery) {
  const lock = join(directory, 'controller.lock');
  let handle;
  try {
    handle = await open(lock, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!allowRecovery)
      throw new Error(
        'Controller lock exists. Use --recover only after inspecting it.',
        { cause: error },
      );
    const previous = JSON.parse(await readFile(lock, 'utf8'));
    if (previous.host !== hostname() || live(previous.pid)) {
      throw new Error(
        'The lock belongs to an active or different host controller',
        { cause: error },
      );
    }
    // Reclaim through an exclusive lock so two recovery requests cannot both unlink a new lock.
    const guard = await open(`${lock}.recovery`, 'wx', 0o600);
    try {
      const current = JSON.parse(await readFile(lock, 'utf8'));
      if (current.host !== previous.host || current.pid !== previous.pid) {
        throw new Error('The controller lock changed during recovery', {
          cause: error,
        });
      }
      await unlink(lock);
      handle = await open(lock, 'wx', 0o600);
    } finally {
      await guard.close();
      await unlink(`${lock}.recovery`);
    }
  }
  try {
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, host: hostname() }),
    );
    await handle.sync();
  } catch (error) {
    await unlink(lock).catch(() => {});
    throw error;
  } finally {
    await handle.close();
  }
  return () => unlink(lock);
}

async function selectModels(config, cwd, codex) {
  const options = {
    cwd,
    env: chatGptEnvironment(),
    timeoutMs: 20_000,
    maxOutputBytes: 1_000_000,
  };
  const account = await runProcess(codex, ['login', 'status'], options);
  if (
    account.exitCode !== 0 ||
    !/logged in using chatgpt/i.test(`${account.stdout}\n${account.stderr}`)
  ) {
    throw new Error(
      'Codex must be signed in with ChatGPT. API key sessions are rejected.',
    );
  }
  const catalog = await runProcess(codex, ['debug', 'models'], options);
  if (catalog.exitCode !== 0)
    throw new Error('Could not read the local Codex model catalog');
  const available = new Set(
    JSON.parse(catalog.stdout).models.map(({ slug }) => slug),
  );
  const models = Object.fromEntries(
    Object.entries(config.models).map(([role, choices]) => [
      role,
      choices.find((model) => available.has(model)),
    ]),
  );
  if (config.tasks.some((task) => !models[task.role])) {
    throw new Error(
      'The Codex catalog has no configured model for one or more task roles',
    );
  }
  return models;
}

function dependencyCommits(task, config, state) {
  const ancestors = new Set();
  const byId = new Map(
    config.tasks.map((candidate) => [candidate.id, candidate]),
  );
  function visit(id) {
    if (ancestors.has(id)) return;
    for (const dependency of byId.get(id).dependsOn) visit(dependency);
    ancestors.add(id);
  }
  for (const id of task.dependsOn) visit(id);
  return [...ancestors].map((id) => state.tasks[id].result.commit);
}

function modelPrompt(task) {
  return [
    'Implement this HookGuard task in the current Git worktree. Read AGENTS.md and the relevant roadmap.',
    `Task ${task.id}, phase ${task.phase}. Only change these repository paths: ${task.paths.join(', ')}.`,
    'Produce implementation and automated tests. Run the checks below and report their actual commands and results.',
    'Leave your changes uncommitted for owner and scope verification. Do not modify Git settings, push, merge, deploy, publish, access credentials, or use paid services.',
    'Use existing local dependencies. Report any blocker without fabricating results.',
    `Required checks: ${JSON.stringify(task.checks)}`,
    '',
    task.prompt,
  ].join('\n');
}

function codexArgs(model, windowsSandbox) {
  return [
    'exec',
    '--ignore-user-config',
    '--ephemeral',
    '--json',
    '--color',
    'never',
    '--sandbox',
    'workspace-write',
    '-c',
    'approval_policy="never"',
    '-c',
    'sandbox_workspace_write.network_access=false',
    ...(windowsSandbox ? ['-c', `windows.sandbox="${windowsSandbox}"`] : []),
    '-c',
    'model_reasoning_effort="medium"',
    '--model',
    model,
    '-',
  ];
}

async function runChecks(
  directory,
  checks,
  processOptions,
  attempt,
  checkpoint,
) {
  for (const check of checks) {
    const [command, args] = checkCommand(check);
    const result = await runProcess(command, args, {
      ...processOptions,
      cwd: directory,
      env: chatGptEnvironment(),
      onSpawn(pid) {
        attempt.activePid = pid;
        void checkpoint();
      },
    });
    attempt.activePid = null;
    attempt.checks.push({
      ...check,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      reason: result.reason,
    });
    await checkpoint();
    if (result.exitCode !== 0 || result.reason) return false;
  }
  return true;
}

async function hasPackageLock(directory) {
  return readFile(join(directory, 'pnpm-lock.yaml')).then(
    () => true,
    (error) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    },
  );
}

async function runQueue(context, offline, models) {
  const {
    config,
    state,
    runDirectory,
    repoRoot,
    runId,
    checkpoint,
    abort,
    recordTranscripts,
    codex,
    windowsSandbox,
  } = context;
  const processOptions = {
    timeoutMs: config.limits.timeoutMs,
    maxOutputBytes: config.limits.maxOutputBytes,
    signal: abort.signal,
  };
  const running = new Map();

  async function runTask(task, workerId) {
    const record = state.tasks[task.id];
    const model = offline ? 'offline' : models[task.role];
    const attempt = {
      number: record.attempts.length + 1,
      workerId,
      model,
      pid: null,
      activePid: null,
      directory: null,
      branch: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      checks: [],
      outcome: 'running',
    };
    record.attempts.push(attempt);
    record.status = 'running';
    record.owner = workerId;
    record.retryAt = null;
    await checkpoint();

    let failure = { reason: 'orchestrator_error', transient: false };
    try {
      const workspace = await prepareWorktree({
        repoRoot,
        runDirectory,
        runId,
        taskId: task.id,
        attempt: attempt.number,
        baseSha: state.baseSha,
        dependencyCommits: dependencyCommits(task, config, state),
      });
      attempt.directory = workspace.directory;
      attempt.branch = workspace.branch;
      await checkpoint();
      if (!offline && (await hasPackageLock(workspace.directory))) {
        const install = [
          {
            command: 'pnpm',
            args: ['install', '--offline', '--frozen-lockfile'],
          },
        ];
        if (
          !(await runChecks(
            workspace.directory,
            install,
            processOptions,
            attempt,
            checkpoint,
          ))
        ) {
          failure.reason = 'offline_install_failed';
          return;
        }
      }
      const command = offline ? process.execPath : codex;
      const args = offline ? [offline] : codexArgs(model, windowsSandbox);
      const result = await runProcess(command, args, {
        ...processOptions,
        cwd: workspace.directory,
        input: offline
          ? JSON.stringify({ task, workerId, attempt: attempt.number, model })
          : modelPrompt(task),
        env: offline ? process.env : chatGptEnvironment(),
        onSpawn(pid) {
          attempt.pid = pid;
          attempt.activePid = pid;
          void checkpoint();
          print({
            event: 'worker_started',
            task: task.id,
            workerId,
            pid,
            model,
            ...workspace,
          });
        },
      });
      attempt.activePid = null;
      attempt.exitCode = result.exitCode;
      attempt.workerDurationMs = result.durationMs;
      attempt.outputBytes = result.outputBytes;
      if (recordTranscripts) {
        const name = `${task.id}-${attempt.number}.json`;
        await writeFile(
          join(runDirectory, name),
          JSON.stringify({ stdout: result.stdout, stderr: result.stderr }),
          { mode: 0o600, flag: 'wx' },
        );
        attempt.transcript = name;
      }
      const workerFailure = classifyWorker(result, offline);
      if (workerFailure) {
        failure = workerFailure;
        if (failure.reason === 'usage_limit') abort.abort();
        print({
          event: 'worker_failed',
          task: task.id,
          reason: failure.reason,
          exitCode: result.exitCode,
        });
        return;
      }
      failure.reason = 'invalid_work';
      await inspectWork({ ...workspace, task });
      failure.reason = 'task_checks_failed';
      if (
        !(await runChecks(
          workspace.directory,
          task.checks,
          processOptions,
          attempt,
          checkpoint,
        ))
      )
        return;
      if (abort.signal.aborted) {
        failure = { reason: 'interrupted', transient: true };
        return;
      }
      failure.reason = 'invalid_work';
      record.result = await commitWork({ ...workspace, task });
      failure = null;
    } catch (error) {
      print({ event: 'task_error', task: task.id, message: error.message });
    } finally {
      if (failure && abort.signal.aborted && failure.reason !== 'usage_limit') {
        failure = { reason: 'interrupted', transient: true };
      }
      attempt.finishedAt = new Date().toISOString();
      record.owner = null;
      attempt.outcome = failure ? failure.reason : 'completed';
      if (!failure) {
        record.status = 'completed';
      } else if (
        failure.transient &&
        attempt.number < config.limits.maxAttempts
      ) {
        record.status = 'retry_wait';
        record.retryAt =
          Date.now() +
          Math.min(
            config.limits.retryBaseMs * 2 ** (attempt.number - 1),
            60_000,
          );
      } else {
        record.status = 'failed';
        record.result = { reason: failure.reason };
      }
      await checkpoint();
      print({
        event: 'task_finished',
        task: task.id,
        status: record.status,
        outcome: attempt.outcome,
        commit: record.result?.commit,
      });
    }
  }

  while (!abort.signal.aborted) {
    if (markBlocked(config, state)) await checkpoint();
    for (const { task, workerId } of nextAssignments(config, state)) {
      const promise = runTask(task, workerId).finally(() =>
        running.delete(task.id),
      );
      running.set(task.id, promise);
    }
    if (running.size) {
      await Promise.race(running.values());
      continue;
    }
    const retryTimes = Object.values(state.tasks)
      .filter(({ status }) => status === 'retry_wait')
      .map(({ retryAt }) => retryAt);
    if (!retryTimes.length) break;
    await wait(
      Math.min(1000, Math.max(1, Math.min(...retryTimes) - Date.now())),
      undefined,
      { signal: abort.signal },
    ).catch((error) => {
      if (error.name !== 'AbortError') throw error;
    });
  }
  await Promise.all(running.values());
  if (markBlocked(config, state)) await checkpoint();
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string', default: 'orchestrator/phase-1.json' },
      'state-dir': { type: 'string' },
      'offline-worker': { type: 'string' },
      'codex-bin': { type: 'string' },
      'windows-sandbox': { type: 'string' },
      'record-transcripts': { type: 'boolean' },
      'confirm-no-paid-usage': { type: 'boolean' },
      recover: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [command] = positionals;
  if (values.help) {
    process.stdout.write(
      'Usage: pnpm run orchestrate <run|status|review> --state-dir DIR [--config FILE] [--offline-worker FILE | --confirm-no-paid-usage] [--recover]\n',
    );
    return 0;
  }
  if (
    positionals.length !== 1 ||
    !['run', 'status', 'review'].includes(command) ||
    !values['state-dir']
  ) {
    throw new Error(
      'Use run, status or review with --state-dir DIR. See --help.',
    );
  }
  const offline =
    values['offline-worker'] && (await realpath(values['offline-worker']));
  const codex = values['codex-bin']
    ? await realpath(values['codex-bin'])
    : 'codex';
  const windowsSandbox = values['windows-sandbox'];
  if (
    windowsSandbox &&
    (process.platform !== 'win32' ||
      !['elevated', 'unelevated'].includes(windowsSandbox))
  )
    throw new Error(
      'Windows sandbox mode must be elevated or unelevated on Windows',
    );
  if (command === 'run' && !offline && !values['confirm-no-paid-usage']) {
    throw new Error(
      'Confirm there are zero ChatGPT credits and automatic reload is off with --confirm-no-paid-usage.',
    );
  }
  const repoRoot = await realpath(
    await git(process.cwd(), ['rev-parse', '--show-toplevel']),
  );
  const configuredDirectory = resolve(values['state-dir']);
  if (
    contains(repoRoot, configuredDirectory) ||
    contains(configuredDirectory, repoRoot)
  ) {
    throw new Error('Use a state directory outside the repository checkout');
  }
  await mkdir(configuredDirectory, { recursive: true, mode: 0o700 });
  const runDirectory = await realpath(configuredDirectory);
  if (contains(repoRoot, runDirectory) || contains(runDirectory, repoRoot)) {
    throw new Error(
      'The state directory resolves into or above the repository checkout',
    );
  }
  const config = await loadConfig(resolve(values.config));
  const file = join(runDirectory, 'state.json');
  if (command === 'status') {
    print(await loadState(file, config));
    return 0;
  }

  const release = await acquireLock(runDirectory, values.recover);
  const abort = new globalThis.AbortController();
  const onSignal = () => abort.abort();
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  try {
    const state = await loadState(file, config).catch(async (error) => {
      if (error.code !== 'ENOENT' || command !== 'run') throw error;
      return createState(config, await git(repoRoot, ['rev-parse', 'HEAD']));
    });
    const runId = createHash('sha256')
      .update(runDirectory)
      .update(state.baseSha)
      .digest('hex')
      .slice(0, 12);
    let writer = Promise.resolve();
    let writeFailure;
    function checkpoint() {
      const snapshot = JSON.parse(JSON.stringify(state));
      writer = writer
        .then(() => saveState(file, snapshot))
        .catch((error) => {
          writeFailure ??= error;
          abort.abort();
        });
      return writer;
    }

    if (Object.values(state.tasks).some(({ status }) => status === 'running')) {
      if (!values.recover)
        throw new Error('Interrupted task ownership requires --recover');
      for (const record of Object.values(state.tasks).filter(
        ({ status }) => status === 'running',
      )) {
        const attempt = record.attempts.at(-1);
        const pid = attempt?.activePid ?? attempt?.pid;
        if (pid != null && live(pid))
          throw new Error(`Worker PID ${pid} is still active`);
      }
      recover(state, config, Date.now());
    }
    await checkpoint();
    if (writeFailure) throw writeFailure;

    if (command === 'review') {
      if (
        Object.values(state.tasks).some(({ status }) => status !== 'completed')
      ) {
        throw new Error(
          'All tasks must be completed before creating the local review candidate',
        );
      }
      const commits = [
        ...new Set(
          config.tasks.flatMap((task) => [
            ...dependencyCommits(task, config, state),
            state.tasks[task.id].result.commit,
          ]),
        ),
      ];
      const review = await prepareReview({
        repoRoot,
        runDirectory,
        runId,
        baseSha: state.baseSha,
        commits,
      });
      const record = { checks: [] };
      const checks = [
        'lint',
        'format:check',
        'typecheck',
        'build',
        'test:coverage',
      ].map((script) => ({
        command: 'pnpm',
        args: [script],
      }));
      if (await hasPackageLock(review.directory)) {
        checks.unshift({
          command: 'pnpm',
          args: ['install', '--offline', '--frozen-lockfile'],
        });
      }
      const passed = await runChecks(
        review.directory,
        checks,
        {
          timeoutMs: config.limits.timeoutMs,
          maxOutputBytes: config.limits.maxOutputBytes,
          signal: abort.signal,
        },
        record,
        async () => {},
      );
      print({
        event: 'review_candidate',
        ...review,
        passed,
        checks: record.checks,
      });
      return passed ? 0 : 1;
    }

    const active = Object.values(state.tasks).some(({ status }) =>
      ['queued', 'retry_wait'].includes(status),
    );
    const models =
      active && !offline ? await selectModels(config, repoRoot, codex) : null;
    await runQueue(
      {
        config,
        state,
        runDirectory,
        repoRoot,
        runId,
        checkpoint,
        abort,
        recordTranscripts: values['record-transcripts'],
        codex,
        windowsSandbox,
      },
      offline,
      models,
    );
    if (writeFailure) throw writeFailure;
    print({ event: 'run_finished', state: file, tasks: state.tasks });
    return Object.values(state.tasks).every(
      ({ status }) => status === 'completed',
    )
      ? 0
      : 1;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await release();
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
