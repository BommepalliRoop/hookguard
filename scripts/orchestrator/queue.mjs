import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const statuses = new Set([
  'queued',
  'running',
  'retry_wait',
  'completed',
  'failed',
  'blocked',
]);
const safeIdentifier = /^[a-z0-9][a-z0-9-]{0,63}$/;
const modelIdentifier = /^[a-z0-9][a-z0-9.-]{0,79}$/;
const windowsDevice = /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/iu;

function requireValue(condition, description) {
  if (!condition) {
    throw new Error(description);
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fields(value, keys, label) {
  requireValue(
    isRecord(value) &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key)),
    `${label} must contain exactly ${keys.join(', ')}`,
  );
}

function integer(value, min, max, label) {
  requireValue(
    Number.isSafeInteger(value) && value >= min && value <= max,
    `${label} must be an integer between ${min} and ${max}`,
  );
  return value;
}

function uniqueList(
  value,
  test,
  label,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  requireValue(
    Array.isArray(value) &&
      value.length >= minimum &&
      value.length <= maximum &&
      value.every(test),
    `${label} contains invalid entries or has an invalid length`,
  );
  requireValue(
    new Set(value).size === value.length,
    `${label} contains duplicates`,
  );
  return value;
}

function matches(pattern, value) {
  return typeof value === 'string' && pattern.test(value);
}

function containsControl(value) {
  return [...value].some(
    (character) => character.charCodeAt(0) < 32 || character === '\x7f',
  );
}

function pathKey(path) {
  return path.normalize('NFC').toLowerCase();
}

function isSafePath(path) {
  return (
    typeof path === 'string' &&
    path.length <= 1024 &&
    path.isWellFormed() &&
    path
      .split('/')
      .every(
        (segment) =>
          segment.length > 0 &&
          segment.length <= 255 &&
          !/[<>:"\\|?*]|[. ]$/u.test(segment) &&
          !containsControl(segment) &&
          pathKey(segment) !== '.git' &&
          !windowsDevice.test(segment),
      )
  );
}

function validateTask(task, index) {
  const label = `tasks[${index}]`;
  fields(
    task,
    ['id', 'phase', 'dependsOn', 'paths', 'role', 'prompt', 'checks'],
    label,
  );
  requireValue(
    matches(safeIdentifier, task.id),
    `${label}.id must be a lowercase identifier`,
  );
  integer(task.phase, 0, Number.MAX_SAFE_INTEGER, `${label}.phase`);
  uniqueList(
    task.dependsOn,
    (id) => matches(safeIdentifier, id),
    `${label}.dependsOn`,
  );
  uniqueList(task.paths, isSafePath, `${label}.paths`);
  requireValue(
    new Set(task.paths.map(pathKey)).size === task.paths.length,
    `${label}.paths contains equivalent paths`,
  );
  requireValue(
    ['routine', 'review'].includes(task.role),
    `${label}.role must be routine or review`,
  );
  requireValue(
    typeof task.prompt === 'string' &&
      task.prompt.trim().length > 0 &&
      !task.prompt.includes('\0'),
    `${label}.prompt must be a nonempty string without NUL characters`,
  );
  requireValue(Array.isArray(task.checks), `${label}.checks must be an array`);
  const checks = task.checks.map((check, checkIndex) => {
    const checkLabel = `${label}.checks[${checkIndex}]`;
    fields(check, ['command', 'args'], checkLabel);
    requireValue(
      ['node', 'pnpm'].includes(check.command),
      `${checkLabel}.command must be node or pnpm`,
    );
    requireValue(
      Array.isArray(check.args) &&
        check.args.every(
          (arg) => typeof arg === 'string' && !containsControl(arg),
        ),
      `${checkLabel}.args must be an array of strings without control characters`,
    );
    return { command: check.command, args: check.args };
  });
  const { id, phase, dependsOn, paths, role, prompt } = task;
  return { id, phase, dependsOn, paths, role, prompt, checks };
}

function requireDependencyGraph(tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  requireValue(byId.size === tasks.length, 'tasks contains duplicate IDs');
  const dependencyCounts = new Map();
  const dependents = new Map(tasks.map(({ id }) => [id, []]));
  for (const task of tasks) {
    dependencyCounts.set(task.id, task.dependsOn.length);
    for (const id of task.dependsOn) {
      const dependency = byId.get(id);
      requireValue(dependency, `Task ${task.id} depends on unknown task ${id}`);
      requireValue(
        dependency.phase <= task.phase,
        `Task ${task.id} depends on later-phase task ${id}`,
      );
      dependents.get(id).push(task.id);
    }
  }
  const ready = tasks
    .filter(({ dependsOn }) => dependsOn.length === 0)
    .map(({ id }) => id);
  for (let index = 0; index < ready.length; index += 1) {
    for (const id of dependents.get(ready[index])) {
      const outstanding = dependencyCounts.get(id) - 1;
      dependencyCounts.set(id, outstanding);
      if (outstanding === 0) {
        ready.push(id);
      }
    }
  }
  requireValue(
    ready.length === tasks.length,
    'tasks contains a dependency cycle',
  );
}

export async function loadConfig(file) {
  const config = JSON.parse(await readFile(file, 'utf8'));
  fields(config, ['version', 'workers', 'limits', 'models', 'tasks'], 'config');
  requireValue(config.version === 1, 'config.version must be 1');
  const workers = uniqueList(
    config.workers,
    (id) => matches(safeIdentifier, id),
    'workers',
    1,
    4,
  );

  fields(
    config.limits,
    ['timeoutMs', 'maxOutputBytes', 'maxAttempts', 'retryBaseMs'],
    'limits',
  );
  const limits = {
    timeoutMs: integer(
      config.limits.timeoutMs,
      1,
      3_600_000,
      'limits.timeoutMs',
    ),
    maxOutputBytes: integer(
      config.limits.maxOutputBytes,
      1,
      67_108_864,
      'limits.maxOutputBytes',
    ),
    maxAttempts: integer(
      config.limits.maxAttempts,
      1,
      10,
      'limits.maxAttempts',
    ),
    retryBaseMs: integer(
      config.limits.retryBaseMs,
      0,
      3_600_000,
      'limits.retryBaseMs',
    ),
  };

  fields(config.models, ['routine', 'review'], 'models');
  const models = {
    routine: uniqueList(
      config.models.routine,
      (id) => matches(modelIdentifier, id),
      'models.routine',
      1,
    ),
    review: uniqueList(
      config.models.review,
      (id) => matches(modelIdentifier, id),
      'models.review',
      1,
    ),
  };
  requireValue(
    Array.isArray(config.tasks) && config.tasks.length > 0,
    'tasks must be a nonempty array',
  );
  const tasks = config.tasks.map(validateTask);
  requireDependencyGraph(tasks);
  return { version: 1, workers, limits, models, tasks };
}

function configDigest(config) {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

export function createState(config, baseSha) {
  requireValue(
    typeof baseSha === 'string' && baseSha.trim().length > 0,
    'baseSha must be a nonempty string',
  );
  const tasks = Object.fromEntries(
    config.tasks.map(({ id }) => [
      id,
      {
        status: 'queued',
        attempts: [],
        owner: null,
        result: null,
        retryAt: null,
      },
    ]),
  );
  return { version: 1, baseSha, configDigest: configDigest(config), tasks };
}

function overlaps(candidate, reserved) {
  return (
    candidate === reserved ||
    candidate.startsWith(`${reserved}/`) ||
    reserved.startsWith(`${candidate}/`)
  );
}

export function nextAssignments(config, state, now = Date.now()) {
  const occupiedWorkers = new Set();
  const occupiedPaths = new Set();
  let phase = Infinity;
  for (const task of config.tasks) {
    const item = state.tasks[task.id];
    if (item.status !== 'completed') {
      phase = Math.min(phase, task.phase);
    }
    if (item.status === 'running') {
      occupiedWorkers.add(item.owner);
      task.paths.forEach((path) => occupiedPaths.add(pathKey(path)));
    }
  }
  const freeWorkers = config.workers.filter((id) => !occupiedWorkers.has(id));
  const assignments = [];
  for (const task of config.tasks) {
    if (assignments.length === freeWorkers.length) {
      break;
    }
    const item = state.tasks[task.id];
    const isReady =
      item.status === 'queued' ||
      (item.status === 'retry_wait' && item.retryAt <= now);
    if (
      !isReady ||
      task.phase !== phase ||
      !task.dependsOn.every((id) => state.tasks[id].status === 'completed')
    ) {
      continue;
    }
    const paths = task.paths.map(pathKey);
    if (
      paths.some((path) =>
        [...occupiedPaths].some((reserved) => overlaps(path, reserved)),
      )
    ) {
      continue;
    }
    assignments.push({ task, workerId: freeWorkers[assignments.length] });
    paths.forEach((path) => occupiedPaths.add(path));
  }
  return assignments;
}

export function recover(state, config, now = Date.now()) {
  let changed = false;
  for (const item of Object.values(state.tasks)) {
    if (item.status !== 'running') {
      continue;
    }
    const canRetry = item.attempts.length < config.limits.maxAttempts;
    item.status = canRetry ? 'retry_wait' : 'failed';
    item.owner = null;
    item.result = { reason: 'interrupted' };
    item.retryAt = canRetry ? now + config.limits.retryBaseMs : null;
    changed = true;
  }
  return changed;
}

function isFailed(item) {
  return item.status === 'failed' || item.status === 'blocked';
}

export function markBlocked(config, state) {
  const failedPhase = config.tasks
    .filter(({ id }) => isFailed(state.tasks[id]))
    .reduce((phase, task) => Math.min(phase, task.phase), Infinity);
  let changed = false;
  let passChanged;
  do {
    passChanged = false;
    for (const task of config.tasks) {
      const item = state.tasks[task.id];
      if (item.status !== 'queued' && item.status !== 'retry_wait') {
        continue;
      }
      const failedDependency = task.dependsOn.find((id) =>
        isFailed(state.tasks[id]),
      );
      if (failedDependency === undefined && task.phase <= failedPhase) {
        continue;
      }
      item.status = 'blocked';
      item.retryAt = null;
      item.result = failedDependency
        ? { reason: 'dependency_failed', dependency: failedDependency }
        : { reason: 'phase_failed', phase: failedPhase };
      passChanged = true;
      changed = true;
    }
  } while (passChanged);
  return changed;
}

export async function saveState(file, state) {
  const directory = dirname(file);
  const temporary = join(directory, `.${basename(file)}.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });
  const contents = `${JSON.stringify(state, null, 2)}\n`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    try {
      await handle.writeFile(contents);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function loadState(file, config) {
  const state = JSON.parse(await readFile(file, 'utf8'));
  fields(state, ['version', 'baseSha', 'configDigest', 'tasks'], 'checkpoint');
  requireValue(state.version === 1, 'checkpoint.version must be 1');
  requireValue(
    typeof state.baseSha === 'string' && state.baseSha.trim().length > 0,
    'checkpoint.baseSha must be a nonempty string',
  );
  requireValue(
    state.configDigest === configDigest(config),
    'checkpoint does not match the config',
  );
  fields(
    state.tasks,
    config.tasks.map(({ id }) => id),
    'checkpoint.tasks',
  );
  const owners = new Set();
  for (const [id, item] of Object.entries(state.tasks)) {
    const label = `checkpoint.tasks.${id}`;
    fields(item, ['status', 'attempts', 'owner', 'result', 'retryAt'], label);
    requireValue(statuses.has(item.status), `${label}.status is invalid`);
    requireValue(
      Array.isArray(item.attempts) &&
        item.attempts.length <= config.limits.maxAttempts &&
        item.attempts.every(isRecord),
      `${label}.attempts is invalid`,
    );
    requireValue(
      item.result === null || isRecord(item.result),
      `${label}.result is invalid`,
    );
    if (item.status === 'running') {
      requireValue(
        config.workers.includes(item.owner) && !owners.has(item.owner),
        `${label}.owner is invalid`,
      );
      owners.add(item.owner);
    } else {
      requireValue(
        item.owner === null,
        `${label}.owner must be null when not running`,
      );
    }
    if (item.status === 'retry_wait') {
      integer(item.retryAt, 0, Number.MAX_SAFE_INTEGER, `${label}.retryAt`);
      requireValue(
        item.attempts.length < config.limits.maxAttempts,
        `${label} has exhausted its retries`,
      );
    } else {
      requireValue(
        item.retryAt === null,
        `${label}.retryAt must be null outside retry_wait`,
      );
    }
  }
  return state;
}
