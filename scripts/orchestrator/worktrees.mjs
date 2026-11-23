import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { isSafePath } from './queue.mjs';

const exec = promisify(execFile);
const identity = [
  '-c',
  'user.name=HookGuard Orchestrator',
  '-c',
  'user.email=orchestrator@localhost',
];

async function output(cwd, args) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.toUpperCase().startsWith('GIT_'),
    ),
  );
  const result = await exec(
    'git',
    [
      '--no-optional-locks',
      '--literal-pathspecs',
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'commit.gpgSign=false',
      '-c',
      'protocol.allow=never',
      ...identity,
      ...args,
    ],
    {
      cwd,
      env: { ...env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
      shell: false,
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 8 * 1024 * 1024,
      encoding: 'utf8',
    },
  );
  return result.stdout;
}

export async function git(cwd, args) {
  return (await output(cwd, args)).trim();
}

function identifier(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value))
    throw new Error('Invalid worktree identifier');
  return value;
}

function commitId(value) {
  if (
    typeof value !== 'string' ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)
  )
    throw new Error('Expected a full Git commit SHA');
  return value;
}

async function checkout(
  { repoRoot, runDirectory, runId, baseSha },
  name,
  commits,
) {
  identifier(runId);
  commitId(baseSha);
  commits.forEach(commitId);
  const state = await realpath(runDirectory);
  const parent = join(state, 'worktrees');
  await mkdir(parent, { recursive: true });
  if (
    (await lstat(parent)).isSymbolicLink() ||
    (await realpath(parent)) !== parent
  )
    throw new Error('Unsafe worktree parent');
  const directory = join(parent, name);
  const branch = `orchestrator/runs/${runId}/${name}`;
  // Reserve the location exclusively, even when a prior run left an empty directory.
  await mkdir(directory);
  await git(repoRoot, ['worktree', 'add', '-b', branch, directory, baseSha]);
  for (const commit of commits)
    await git(directory, ['cherry-pick', '--no-edit', commit]);
  return {
    directory,
    branch,
    startSha: await git(directory, ['rev-parse', 'HEAD']),
  };
}

export function prepareWorktree(options) {
  const { taskId, attempt, dependencyCommits = [] } = options;
  if (!Number.isSafeInteger(attempt) || attempt < 1)
    throw new Error('Invalid attempt');
  return checkout(
    options,
    `task-${identifier(taskId)}-${attempt}`,
    dependencyCommits,
  );
}

export function prepareReview({ commits, ...options }) {
  return checkout(options, `review-${randomUUID()}`, commits);
}

function safePath(value) {
  if (!isSafePath(value)) throw new Error('Unsafe repository path');
  return value;
}

function nulList(raw) {
  if (!raw) return [];
  if (!raw.endsWith('\0') || raw.includes('\uFFFD'))
    throw new Error('Unsupported Git path encoding');
  return raw.slice(0, -1).split('\0');
}

async function regularPath(directory, file) {
  let current = directory;
  for (const part of file.split('/')) {
    current = join(current, part);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return;
      throw error;
    }
    if (info.isSymbolicLink() || !(info.isDirectory() || info.isFile()))
      throw new Error(`Unsupported file type: ${file}`);
  }
}

async function verifyHead(directory, startSha, expectedBranch) {
  commitId(startSha);
  const head = await git(directory, ['rev-parse', 'HEAD']);
  const branch = await git(directory, ['symbolic-ref', '--short', 'HEAD']);
  if (
    head !== startSha ||
    (expectedBranch !== undefined && branch !== expectedBranch) ||
    !/^orchestrator\/runs\/[a-z0-9_-]+\/task-[a-z0-9_-]+-\d+$/i.test(branch) ||
    branch.split('/').at(-1) !== basename(directory) ||
    basename(dirname(directory)) !== 'worktrees' ||
    resolve(await git(directory, ['rev-parse', '--show-toplevel'])) !==
      resolve(directory)
  )
    throw new Error('Worker HEAD or branch changed');
  return branch;
}

function checkModes(raw) {
  const entries = nulList(raw);
  const files = [];
  for (let i = 0; i < entries.length; i += 2) {
    if (
      !/^:(?:000000|100644|100755) (?:000000|100644|100755) /.test(entries[i])
    )
      throw new Error(`Unsupported Git file mode: ${entries[i + 1]}`);
    files.push(entries[i + 1]);
  }
  return files;
}

export async function inspectWork({ directory, startSha, branch, task }) {
  await verifyHead(directory, startSha, branch);
  const scopes = task.paths.map((path) => safePath(path.replace(/\/$/, '')));
  const records = nulList(
    await output(directory, [
      'status',
      '--porcelain=v1',
      '-z',
      '--no-renames',
      '--untracked-files=all',
      '--ignore-submodules=none',
    ]),
  );
  const files = [];
  for (const record of records) {
    const status = record.slice(0, 2);
    if (status.includes('U') || ['DD', 'AA'].includes(status))
      throw new Error('Unresolved Git conflict');
    const file = safePath(record.slice(3));
    if (!scopes.some((scope) => file === scope || file.startsWith(scope + '/')))
      throw new Error(`Outside task scope: ${file}`);
    await regularPath(directory, file);
    files.push(file);
  }
  checkModes(
    await output(directory, [
      'diff',
      '--cached',
      '--no-renames',
      '--raw',
      '-z',
      'HEAD',
    ]),
  );
  checkModes(await output(directory, ['diff', '--no-renames', '--raw', '-z']));
  const ignored = nulList(
    await output(directory, [
      'ls-files',
      '--cached',
      '--ignored',
      '--exclude-standard',
      '-z',
    ]),
  );
  if (files.some((file) => ignored.includes(file)))
    throw new Error('Ignored path in staged changes');
  const testFile = (path) =>
    /(?:^|\/)(?:tests?|__tests__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(path);
  const codeFile = (path) =>
    /\.(?:[cm]?[jt]sx?|json|ya?ml|toml|sh|ps1|py|css|html)$/i.test(path);
  if (
    !files.some((path) => !testFile(path) && codeFile(path)) ||
    !files.some(
      (path) => testFile(path) && /\.(?:[cm]?[jt]sx?|py)$/i.test(path),
    )
  )
    throw new Error('Expected code or configuration and test changes');
  return files.sort();
}

export async function commitWork(args) {
  const { directory, startSha, task } = args;
  const files = await inspectWork(args);
  // Stage literal paths individually to handle arbitrary names and command-line length limits.
  for (const file of files) {
    const tracked = await output(directory, ['ls-files', '-z', '--', file]);
    if (
      tracked ||
      (await output(directory, [
        'ls-files',
        '--others',
        '--exclude-standard',
        '-z',
        '--',
        file,
      ]))
    ) {
      await git(directory, ['add', '-A', '--', file]);
    }
  }
  const staged = await inspectWork(args);
  if (JSON.stringify(files) !== JSON.stringify(staged))
    throw new Error('Changed files shifted while staging');
  const tree = await git(directory, ['write-tree']);
  const stagedFiles = checkModes(
    await output(directory, [
      'diff-tree',
      '-r',
      '--no-renames',
      '--raw',
      '-z',
      startSha,
      tree,
    ]),
  );
  if (JSON.stringify(files) !== JSON.stringify(stagedFiles.sort()))
    throw new Error('Committed tree differs from reviewed paths');
  const commit = await git(directory, [
    'commit-tree',
    tree,
    '-p',
    startSha,
    '-m',
    `Complete ${identifier(task.id)}`,
  ]);
  const branch = await verifyHead(directory, startSha, args.branch);
  await git(directory, [
    'update-ref',
    `refs/heads/${branch}`,
    commit,
    startSha,
  ]);
  return { commit, files };
}
