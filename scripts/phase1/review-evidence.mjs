import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const statuses = new Set([
  'queued',
  'running',
  'retry_wait',
  'completed',
  'failed',
  'blocked',
]);
const sha = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

function requireEvidence(condition) {
  if (!condition) throw new Error('Invalid HookGuard checkpoint');
}

function describeCheck(check) {
  requireEvidence(
    check &&
      ['node', 'pnpm'].includes(check.command) &&
      (check.exitCode === null || Number.isSafeInteger(check.exitCode)) &&
      Number.isSafeInteger(check.durationMs) &&
      check.durationMs >= 0,
  );
  const exit =
    check.exitCode === null ? 'no exit code' : `exit ${check.exitCode}`;
  return `    - \`${check.command}\` · ${exit} · ${check.durationMs} ms`;
}

export function renderReviewEvidence(state) {
  requireEvidence(
    state?.version === 1 &&
      typeof state.baseSha === 'string' &&
      sha.test(state.baseSha) &&
      state.tasks &&
      typeof state.tasks === 'object' &&
      !Array.isArray(state.tasks),
  );
  const lines = [
    '## Verification evidence',
    '',
    `Base SHA \`${state.baseSha}\``,
    '',
  ];
  for (const [id, task] of Object.entries(state.tasks)) {
    requireEvidence(
      /^[a-z0-9][a-z0-9-]{0,63}$/u.test(id) &&
        statuses.has(task?.status) &&
        Array.isArray(task?.attempts),
    );
    const commit = task.result?.commit;
    if (commit !== undefined || task.status === 'completed') {
      requireEvidence(typeof commit === 'string' && sha.test(commit));
    }
    lines.push(
      `- **${id}** · ${task.status}${commit ? ` · \`${commit}\`` : ''}`,
    );
    for (const [index, attempt] of task.attempts.entries()) {
      requireEvidence(attempt && Array.isArray(attempt.checks));
      if (attempt.checks.length === 0) continue;
      lines.push(
        `  - Attempt ${index + 1}`,
        ...attempt.checks.map(describeCheck),
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    if (process.argv.length !== 3)
      throw new Error('Expected one checkpoint file');
    const state = JSON.parse(await readFile(process.argv[2], 'utf8'));
    process.stdout.write(renderReviewEvidence(state));
  } catch {
    process.stderr.write('Provide a valid HookGuard state.json checkpoint.\n');
    process.exitCode = 2;
  }
}
