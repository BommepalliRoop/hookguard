import { createServer, type RequestListener } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createTargetPolicy,
  sendRequest,
  TargetPolicyError,
} from '../src/transport.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
async function listen(handler: RequestListener) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  cleanup.push(async () => {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected loopback server.');
  const origin = `http://127.0.0.1:${address.port}`;
  return { origin, policy: createTargetPolicy([origin]) };
}
const get = { method: 'GET', timeoutMs: 5000 } as const;

describe('loopback target policy', () => {
  it('normalizes explicit origins and keeps the absolute request path and query', () => {
    const policy = createTargetPolicy([
      'HTTP://LOCALHOST:80/',
      'https://[::1]:443',
    ]);
    expect(policy.resolve('http://localhost/a?b=1').href).toBe(
      'http://127.0.0.1/a?b=1',
    );
    expect(policy.resolve('https://[::1]/a').href).toBe('https://[::1]/a');
    for (const raw of [
      'https://localhost',
      'http://localhost:81',
      'http://[::1]',
    ])
      expect(() => policy.resolve(raw)).toThrow(TargetPolicyError);
  });

  it.each([
    'http://example.invalid',
    'file:///local',
    'http://127.1',
    'http://2130706433',
    'http://127.0.0.01',
    'http://localhost.',
    'http://user@localhost',
    'http://localhost@other.invalid',
    'http://localhost/#',
    'http://localhost\\path',
    'http://lo\ncalhost',
    'http://localhost:65536',
    'http://localhost:',
    '//localhost',
  ])('rejects invalid target spelling %s before any connection', (raw) => {
    const policy = createTargetPolicy(['http://localhost']);
    expect(() => policy.resolve(raw)).toThrow(TargetPolicyError);
    expect(() => createTargetPolicy([raw])).toThrow(TargetPolicyError);
  });
  it.each(['/path', '/?token=value', '?', '/a/..'])(
    'requires an origin-only allowlist entry %s',
    (suffix) => {
      expect(() => createTargetPolicy(['http://localhost' + suffix])).toThrow(
        TargetPolicyError,
      );
    },
  );
});

describe('bounded loopback HTTP', () => {
  it('preserves the bytes of a POST up to the exact cap, status, and safe Retry-After', async () => {
    const bytes = Buffer.alloc(1024 * 1024, 0xff);
    const { origin, policy } = await listen((req, res) => {
      res.writeHead(429, { 'Retry-After': '3', 'Set-Cookie': 'synthetic' });
      req.pipe(res);
    });
    const result = await sendRequest(policy, origin, {
      method: 'POST',
      body: bytes,
      headers: { 'Content-Type': 'application/octet-stream' },
      timeoutMs: 5000,
    });
    expect(result.body.equals(bytes)).toBe(true);
    expect(Object.keys(result).sort()).toEqual([
      'body',
      'retryAfter',
      'status',
    ]);
    expect(result.retryAfter).toBe('3');
    expect(result.status).toBe(429);
  });

  it('rejects excess request bytes and unapproved headers before dispatch', async () => {
    let hits = 0;
    const { origin, policy } = await listen((_req, res) => {
      hits++;
      res.end();
    });
    await expect(
      sendRequest(policy, origin, {
        ...get,
        method: 'POST',
        body: Buffer.alloc(1024 * 1024 + 1),
      }),
    ).rejects.toMatchObject({ code: 'request_too_large' });
    for (const key of [
      'Host',
      'Authorization',
      'Cookie',
      'Transfer-Encoding',
      'X-Forwarded-Host',
    ]) {
      await expect(
        sendRequest(policy, origin, {
          ...get,
          headers: { [key]: 'synthetic' },
        }),
      ).rejects.toBeInstanceOf(TargetPolicyError);
    }
    expect(hits).toBe(0);
  });

  it.each([true, false])(
    'limits response bytes with content length %s',
    async (declared) => {
      const { origin, policy } = await listen((_req, res) => {
        if (declared) res.setHeader('Content-Length', 1024 * 1024 + 1);
        res.write(Buffer.alloc(1024 * 1024));
        res.end(Buffer.from([1]));
      });
      await expect(sendRequest(policy, origin, get)).rejects.toMatchObject({
        code: 'response_too_large',
      });
    },
  );

  it('owns the deadline through the final response byte', async () => {
    const { origin, policy } = await listen((_req, res) => {
      res.write('partial');
    });
    await expect(
      sendRequest(policy, origin, { ...get, timeoutMs: 100 }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });

  it('reports truncated responses without exposing the target URL', async () => {
    const { origin, policy } = await listen((_req, res) => {
      res.writeHead(200, { 'Content-Length': 200 });
      res.end('short');
    });
    await expect(
      sendRequest(policy, origin + '/synthetic?marker=private', get),
    ).rejects.toMatchObject({
      message: 'network_error',
      code: 'network_error',
    });
  });

  it('returns redirect status without following Location or exposing an arbitrary header value', async () => {
    const paths: string[] = [];
    const { origin, policy } = await listen((req, res) => {
      paths.push(req.url ?? '');
      res
        .writeHead(302, {
          Location: '/second',
          'Retry-After': 'synthetic private value',
        })
        .end();
    });
    const result = await sendRequest(policy, origin + '/first', get);
    expect(paths).toEqual(['/first']);
    expect(result).toEqual({ status: 302, body: Buffer.alloc(0) });
  });
});
