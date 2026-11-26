import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const maxBytes = 1024 * 1024;
const authority =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::[1-9]\d{0,4})?(?=[/?]|$)/i;

export class TargetPolicyError extends Error {
  override name = 'TargetPolicyError';
}

type TransportCode =
  'timeout' | 'network_error' | 'response_too_large' | 'request_too_large';

export class TransportError extends Error {
  override name = 'TransportError';
  constructor(readonly code: TransportCode) {
    super(code);
  }
}

export interface TargetPolicy {
  resolve(raw: string): URL;
}

export interface RequestOptions {
  method: 'GET' | 'POST';
  timeoutMs: number;
  body?: Uint8Array;
  headers?: Record<string, string>;
}

export interface TransportResponse {
  status: number;
  body: Buffer;
  retryAfter?: string;
}

function loopbackUrl(raw: string, originOnly = false): URL {
  const match = typeof raw === 'string' && raw.match(authority);
  if (
    !match ||
    /[\s\p{Cc}\\#]/u.test(raw) ||
    (originOnly && !['', '/'].includes(raw.slice(match[0].length)))
  ) {
    throw new TargetPolicyError(
      'Expected an explicit HTTP(S) loopback origin.',
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new TargetPolicyError('Invalid loopback URL.');
  }
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url;
}

export function createTargetPolicy(
  allowTargets: readonly string[],
): TargetPolicy {
  const allowed = new Set(
    allowTargets.map((raw) => loopbackUrl(raw, true).origin),
  );
  return Object.freeze({
    resolve(raw: string) {
      const url = loopbackUrl(raw);
      if (!allowed.has(url.origin))
        throw new TargetPolicyError('Target origin is outside the allowlist.');
      return url;
    },
  });
}

function safeRetryAfter(value: string | undefined): string | undefined {
  if (!value || value.length > 32) return undefined;
  if (/^\d+$/.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toUTCString() === value
    ? value
    : undefined;
}

export async function sendRequest(
  policy: TargetPolicy,
  target: string,
  options: RequestOptions,
): Promise<TransportResponse> {
  // Recheck the resolved origin before opening a socket, including for injected policies.
  const url = loopbackUrl(policy.resolve(target).href);
  if ((options.body?.byteLength ?? 0) > maxBytes)
    throw new TransportError('request_too_large');
  if (
    !['GET', 'POST'].includes(options.method) ||
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs < 1 ||
    options.timeoutMs > 2147483647
  )
    throw new TransportError('network_error');

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    const name = key.toLowerCase();
    if (
      !(
        name === 'content-type' ||
        /^x-(?!forwarded(?:-|$)|real-ip$)[a-z0-9-]+$/.test(name)
      ) ||
      !/^[\x20-\x7e]*$/.test(value) ||
      value.length > 4096
    ) {
      throw new TargetPolicyError(
        'Request header is outside the transport policy.',
      );
    }
    headers[name] = value;
  }
  if (options.body !== undefined)
    headers['content-length'] = String(options.body.byteLength);
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const signal = AbortSignal.timeout(options.timeoutMs);
  try {
    return await new Promise<TransportResponse>((resolve, reject) => {
      const req = request(
        url,
        {
          method: options.method,
          headers,
          signal,
          agent: false,
          rejectUnauthorized: true,
          maxHeaderSize: 16384,
        },
        (res) => {
          // One bounded backing buffer also caps overhead for tiny streamed chunks.
          let storage: Buffer | undefined;
          let size = 0;
          const rejectOversize = () => {
            reject(new TransportError('response_too_large'));
            req.destroy();
          };
          res.on('error', reject);
          if (
            res.statusCode !== undefined &&
            res.statusCode >= 300 &&
            res.statusCode < 400
          ) {
            reject(new TargetPolicyError('Redirect responses are prohibited.'));
            req.destroy();
            return;
          }
          const declaredLength = Number(res.headers['content-length']);
          if (declaredLength > maxBytes) {
            rejectOversize();
            return;
          }
          res.on('data', (chunk: Buffer) => {
            if (size + chunk.length > maxBytes) {
              rejectOversize();
              return;
            }
            storage ??= Buffer.allocUnsafe(
              Number.isSafeInteger(declaredLength) ? declaredLength : maxBytes,
            );
            chunk.copy(storage, size);
            size += chunk.length;
          });
          res.once('end', () => {
            const retryAfter = safeRetryAfter(res.headers['retry-after']);
            resolve({
              status: res.statusCode!,
              body: storage
                ? Buffer.from(storage.subarray(0, size))
                : Buffer.alloc(0),
              ...(retryAfter === undefined ? {} : { retryAfter }),
            });
          });
        },
      );
      req.once('error', reject);
      req.once('upgrade', (_response, socket) => {
        socket.destroy();
        reject(new TransportError('network_error'));
      });
      req.end(options.body);
    });
  } catch (cause) {
    if (cause instanceof TransportError || cause instanceof TargetPolicyError)
      throw cause;
    throw new TransportError(signal.aborted ? 'timeout' : 'network_error');
  }
}
