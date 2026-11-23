import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';

export function runProcess(command, args, options) {
  const { cwd, input, env, timeoutMs, maxOutputBytes, signal, onSpawn } =
    options;
  if (signal?.aborted) {
    return Promise.resolve({
      exitCode: null,
      reason: 'interrupted',
      durationMs: 0,
      outputBytes: 0,
    });
  }

  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let reason = null;
    let stopped;

    function finish(exitCode) {
      clearTimeout(timeout);
      clearTimeout(stopped);
      signal?.removeEventListener('abort', interrupt);
      resolve({
        exitCode,
        reason,
        durationMs: Date.now() - started,
        outputBytes,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    }

    function stop(cause) {
      if (reason) return;
      reason = cause;
      if (child.pid) {
        if (process.platform === 'win32') {
          const killer = spawn(
            'taskkill.exe',
            ['/PID', String(child.pid), '/T', '/F'],
            {
              stdio: 'ignore',
              windowsHide: true,
            },
          );
          killer.on('error', () => child.kill());
        } else {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch (error) {
            if (error.code !== 'ESRCH') child.kill('SIGKILL');
          }
        }
      }
      stopped = setTimeout(() => {
        child.kill('SIGKILL');
        child.stdin.destroy();
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
        finish(null);
      }, 3000);
    }

    function interrupt() {
      stop('interrupted');
    }

    function capture(destination, chunk) {
      const remaining = maxOutputBytes - outputBytes;
      if (remaining > 0) destination.push(chunk.subarray(0, remaining));
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) stop('output_limit');
    }

    const timeout = setTimeout(() => stop('timeout'), timeoutMs);
    signal?.addEventListener('abort', interrupt, { once: true });
    child.once('spawn', () => onSpawn?.(child.pid));
    child.once('error', () => {
      reason ??= 'spawn_error';
    });
    child.once('close', finish);
    child.stdout.on('data', (chunk) => capture(stdout, chunk));
    child.stderr.on('data', (chunk) => capture(stderr, chunk));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export function chatGptEnvironment() {
  const allowed = new Set([
    'APPDATA',
    'CODEX_HOME',
    'COMSPEC',
    'HOME',
    'HOMEDRIVE',
    'HOMEPATH',
    'LANG',
    'LOCALAPPDATA',
    'PATH',
    'PATHEXT',
    'SYSTEMDRIVE',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'TMPDIR',
    'USERPROFILE',
    'WINDIR',
  ]);
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      allowed.has(key.toUpperCase()),
    ),
  );
}

export function checkCommand({ command, args }) {
  if (command === 'node') return [process.execPath, args];
  if (command !== 'pnpm') throw new Error('Unsupported check command');
  if (
    process.env.npm_execpath &&
    /[/\\]pnpm\.[cm]?js$/i.test(process.env.npm_execpath)
  ) {
    return [process.execPath, [process.env.npm_execpath, ...args]];
  }
  if (process.platform === 'win32') {
    throw new Error(
      'Launch the orchestrator via pnpm run orchestrate for pnpm checks on Windows',
    );
  }
  return ['pnpm', args];
}

export function classifyWorker(result, offline) {
  if (result.reason === 'timeout' || result.reason === 'interrupted') {
    return { reason: result.reason, transient: true };
  }
  if (result.reason) return { reason: result.reason, transient: false };
  if (result.exitCode === 0) return null;
  if (offline) {
    return { reason: 'worker_exit', transient: result.exitCode === 75 };
  }

  const errors = [];
  for (const line of (result.stdout || '').split('\n')) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'error' && typeof event.message === 'string')
        errors.push(event.message);
      if (
        event.type === 'turn.failed' &&
        typeof event.error?.message === 'string'
      ) {
        errors.push(event.error.message);
      }
    } catch {
      // Output that is not a Codex protocol event cannot trigger a retry.
    }
  }
  const details = errors.join('\n');
  if (
    /quota|usage limit|credit balance|billing|insufficient[_ ]quota/i.test(
      details,
    )
  ) {
    return { reason: 'usage_limit', transient: false };
  }
  if (
    /\b503\b|\b502\b|\b504\b|ECONNRESET|ETIMEDOUT|connection reset|stream disconnected/i.test(
      details,
    )
  ) {
    return { reason: 'transient_service_error', transient: true };
  }
  return { reason: 'worker_exit', transient: false };
}
