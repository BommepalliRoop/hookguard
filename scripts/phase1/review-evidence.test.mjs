import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { expect, it } from 'vitest';
import { renderReviewEvidence } from './review-evidence.mjs';

const baseSha = 'a'.repeat(40);
const commit = 'b'.repeat(40);

it('summarizes verified and blocked tasks without disclosing private fields', () => {
  const summary = renderReviewEvidence({
    version: 1,
    baseSha,
    tasks: {
      'hg-007': {
        status: 'completed',
        result: { commit },
        attempts: [
          {
            directory: 'D:\\private',
            transcript: 'private.json',
            checks: [
              {
                command: 'pnpm',
                args: ['C:\\private'],
                exitCode: 0,
                durationMs: 35,
              },
            ],
          },
        ],
      },
      'hg-009': { status: 'blocked', attempts: [] },
    },
  });

  expect(summary).toContain(baseSha);
  expect(summary).toContain(`hg-007** · completed · \`${commit}\``);
  expect(summary).toContain('hg-009** · blocked');
  expect(summary).toContain('`pnpm` · exit 0 · 35 ms');
  expect(summary).not.toContain('private');
});

it('shows failed attempts and interrupted commands without inventing an exit code', () => {
  const summary = renderReviewEvidence({
    version: 1,
    baseSha,
    tasks: {
      'hg-008': {
        status: 'retry_wait',
        attempts: [
          { checks: [{ command: 'node', exitCode: null, durationMs: 40 }] },
        ],
      },
    },
  });
  expect(summary).toContain('retry_wait');
  expect(summary).toContain('`node` · no exit code · 40 ms');
});

it.each([
  null,
  { version: 1, baseSha: 'invalid', tasks: {} },
  {
    version: 1,
    baseSha,
    tasks: { 'hg-007': { status: 'completed', attempts: [] } },
  },
  {
    version: 1,
    baseSha,
    tasks: { 'a\nb': { status: 'failed', attempts: [] } },
  },
])('rejects malformed checkpoint evidence', (state) => {
  expect(() => renderReviewEvidence(state)).toThrow(
    'Invalid HookGuard checkpoint',
  );
});

it('exits with a usage error for a missing checkpoint argument', () => {
  const script = fileURLToPath(
    new URL('./review-evidence.mjs', import.meta.url),
  );
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(
    'Provide a valid HookGuard state.json checkpoint',
  );
});
