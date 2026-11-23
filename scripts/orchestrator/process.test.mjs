import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { chatGptEnvironment, classifyWorker, runProcess } from './process.mjs';

describe('worker process execution', () => {
  const options = { cwd: process.cwd(), timeoutMs: 5000, maxOutputBytes: 1024 };

  it('reports the PID, real exit code, and captured output', async () => {
    let pid;
    const result = await runProcess(
      process.execPath,
      [
        '-e',
        'process.stdout.write(String(process.pid)); process.exitCode = 75',
      ],
      {
        ...options,
        onSpawn: (startedPid) => {
          pid = startedPid;
        },
      },
    );
    expect(Number(result.stdout)).toBe(pid);
    expect(result).toMatchObject({ exitCode: 75, reason: null });
    expect(classifyWorker(result, true)).toEqual({
      reason: 'worker_exit',
      transient: true,
    });
  });

  it('terminates a worker when its output budget is exhausted', async () => {
    const result = await runProcess(
      process.execPath,
      [
        '-e',
        "process.stdout.write('x'.repeat(4096)); setInterval(() => {}, 500)",
      ],
      options,
    );
    expect(result.reason).toBe('output_limit');
    expect(result.stdout).toHaveLength(options.maxOutputBytes);
  });

  it('terminates a worker on timeout', async () => {
    const result = await runProcess(
      process.execPath,
      ['-e', 'setInterval(() => {}, 500)'],
      {
        ...options,
        timeoutMs: 250,
      },
    );
    expect(result.reason).toBe('timeout');
  });

  it('retries structured service errors but stops on credit or quota failures', () => {
    const result = { reason: null, exitCode: 1 };
    expect(
      classifyWorker(
        { ...result, stdout: '{"type":"error","message":"HTTP 503"}' },
        false,
      ),
    ).toEqual({ reason: 'transient_service_error', transient: true });
    expect(
      classifyWorker(
        {
          ...result,
          stdout: '{"type":"error","message":"credit balance exhausted"}',
        },
        false,
      ),
    ).toEqual({ reason: 'usage_limit', transient: false });
    expect(classifyWorker({ ...result, stdout: '503' }, false)).toEqual({
      reason: 'worker_exit',
      transient: false,
    });
  });

  it('does not forward API or GitHub tokens to Codex processes', () => {
    const keys = Object.keys(chatGptEnvironment()).map((key) =>
      key.toUpperCase(),
    );
    expect(keys).not.toContain('OPENAI_API_KEY');
    expect(keys).not.toContain('GH_TOKEN');
  });
});
