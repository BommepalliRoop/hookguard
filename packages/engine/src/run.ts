import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import { type RunResultV1, type ScenarioV1 } from '@hookguard/schema';
import {
  compileDeliveries,
  DeliveryPlanError,
  lookupJsonPath,
} from './delivery-plan.js';
import { createPrng } from './primitives.js';
import { retryDelayMs } from './retry.js';
import {
  createTargetPolicy,
  sendRequest,
  TargetPolicyError,
  TransportError,
  type TargetPolicy,
} from './transport.js';

const { version } = createRequire(import.meta.url)('../package.json') as {
  version: string;
};
type Attempt = RunResultV1['attempts'][number];
type AssertionResult = RunResultV1['assertions'][number];

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return (
      '{' +
      Object.keys(record)
        .sort()
        .filter((key) => record[key] !== undefined)
        .map((key) => JSON.stringify(key) + ':' + canonical(record[key]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}

export function scenarioHash(scenario: ScenarioV1, fixture: Buffer): string {
  return createHash('sha256')
    .update(canonical(scenario))
    .update('\0')
    .update(fixture)
    .digest('hex');
}

function denyRedirect(status: number) {
  if (status >= 300 && status < 400) {
    throw new TargetPolicyError('Redirect responses are prohibited.');
  }
}

function isPathWithin(path: string, parent: string): boolean {
  return (
    path === parent ||
    path.startsWith(parent + '.') ||
    path.startsWith(parent + '[')
  );
}

async function evaluateAssertions(
  scenario: ScenarioV1,
  policy: TargetPolicy,
  attempts: readonly Attempt[],
  terminal: readonly Attempt[],
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];
  const state = new Map<string, unknown>();
  for (const assertion of scenario.assertions) {
    if (assertion.kind === 'delivery_count') {
      const passed = attempts.length === assertion.expected;
      results.push({
        kind: assertion.kind,
        passed,
        detail: `Expected ${assertion.expected} attempts, observed ${attempts.length}.`,
      });
    } else if (assertion.kind === 'http_status') {
      const wanted = Array.isArray(assertion.expected)
        ? assertion.expected
        : [assertion.expected];
      const observed = terminal.map(({ status }) => status ?? null);
      results.push({
        kind: assertion.kind,
        passed:
          observed.length > 0 &&
          observed.every(
            (status) => status !== null && wanted.includes(status),
          ),
        detail: `Expected final HTTP status ${wanted.join(' or ')}, observed ${observed.map((status) => status ?? 'no response').join(', ')}.`,
      });
    } else {
      const url = policy.resolve(assertion.url).href;
      if (!state.has(url)) {
        let json: unknown;
        try {
          const response = await sendRequest(policy, url, {
            method: 'GET',
            timeoutMs: scenario.execution.timeoutMs,
          });
          denyRedirect(response.status);
          if (response.status >= 200 && response.status < 300) {
            json = JSON.parse(response.body.toString('utf8'));
          }
        } catch (error) {
          if (!(
            error instanceof TransportError || error instanceof SyntaxError
          ))
            throw error;
        }
        state.set(url, json);
      }
      const actual = lookupJsonPath(state.get(url), assertion.jsonPath);
      const passed =
        actual !== undefined && isDeepStrictEqual(actual, assertion.equals);
      const values =
        typeof actual === 'number' &&
        Number.isFinite(actual) &&
        typeof assertion.equals === 'number' &&
        !scenario.security.redactPaths.some(
          (path) =>
            isPathWithin(assertion.jsonPath, path) ||
            isPathWithin(path, assertion.jsonPath),
        );
      results.push({
        kind: assertion.kind,
        passed,
        detail: values
          ? `Expected ${assertion.equals}, observed ${actual}.`
          : passed
            ? 'State matched the expected value.'
            : 'State did not match the expected value.',
      });
    }
  }
  return results;
}

export async function runScenario(
  scenario: ScenarioV1,
  fixture: Buffer,
  target: string,
): Promise<RunResultV1> {
  const policy = createTargetPolicy(scenario.security.allowTargets);
  const destination = policy.resolve(target).href;
  for (const assertion of scenario.assertions) {
    if (assertion.kind === 'state_json') policy.resolve(assertion.url);
  }
  if (scenario.scenario === 'bad_signature') {
    throw new DeliveryPlanError(
      'Signature scenarios require signature verification support.',
    );
  }

  const startedAt = new Date().toISOString();
  const seed = scenario.seed ?? 0;
  const steps = compileDeliveries(scenario, fixture);
  const retry = scenario.execution.retry;
  const random = createPrng(seed);
  const attempts: Attempt[] = [];
  const terminal: Attempt[] = [];
  for (const { event } of steps) {
    let delay = 0;
    for (let index = 1; index <= (retry?.maxAttempts ?? 1); index += 1) {
      if (delay > 0) await sleep(delay);
      const started = performance.now();
      const attempt: Attempt = {
        sequence: attempts.length + 1,
        durationMs: 0,
        plannedDelayMs: delay,
      };
      let retryAfter: string | undefined;
      const simulation =
        attempts.length === 0 ? scenario.execution.fail : undefined;
      if (simulation && simulation !== 'none') {
        if (simulation === 'timeout') attempt.errorCode = 'simulated_timeout';
        else {
          attempt.status = simulation === 'http_429' ? 429 : 503;
          attempt.errorCode = 'simulated_status';
        }
      } else {
        try {
          const response = await sendRequest(policy, destination, {
            method: 'POST',
            timeoutMs: scenario.execution.timeoutMs,
            headers: { 'content-type': 'application/json' },
            body: event,
          });
          denyRedirect(response.status);
          attempt.status = response.status;
          retryAfter = response.retryAfter;
        } catch (error) {
          if (!(error instanceof TransportError)) throw error;
          attempt.errorCode = error.code;
        }
      }
      attempt.durationMs = Math.round(performance.now() - started);
      attempts.push(attempt);
      const retryable =
        attempt.status !== undefined
          ? retry?.statuses.includes(attempt.status)
          : ['timeout', 'simulated_timeout', 'network_error'].includes(
              attempt.errorCode ?? '',
            );
      if (!retry || index === retry.maxAttempts || !retryable) {
        terminal.push(attempt);
        break;
      }
      delay = retryDelayMs(
        retry,
        random,
        attempt.status === 429 || attempt.status === 503
          ? retryAfter
          : undefined,
      );
    }
  }

  const assertions = await evaluateAssertions(
    scenario,
    policy,
    attempts,
    terminal,
  );
  return {
    schemaVersion: 1,
    name: scenario.name,
    seed,
    scenarioHash: scenarioHash(scenario, fixture),
    engineVersion: version,
    startedAt,
    attempts,
    assertions,
    passed: assertions.every(({ passed }) => passed),
  };
}
