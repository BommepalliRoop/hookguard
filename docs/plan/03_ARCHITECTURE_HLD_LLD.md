# HLD / LLD — HookGuard

## Stack (keep MVP intentionally small)

- Runtime: **Node.js supported active LTS**, TypeScript strict mode.
- Package manager: **pnpm** workspaces (lockfile checked in).
- CLI: `commander` or `cac`; input validation: Zod + JSON Schema; YAML parser: `yaml`.
- HTTP: built-in `fetch`/`undici` with AbortSignal timeout and content size limits.
- Tests: Vitest; coverage: v8 provider; lint: ESLint; format: Prettier.
- Report: JSON and JUnit XML from one versioned normalized result model.
- CI: GitHub Actions with minimum permissions; optional GitHub Action wrapper after CLI works.
- No DB and no hosted backend in MVP. No AI/API keys required.

## Logical design

```text
User / CI
   |
   v
`hookguard run --config hookguard.yaml --target http://127.0.0.1:3000`
   |
Config loader -> Validator -> Safe target policy -> Scenario compiler
                                                |
                                          Deterministic runner
                                          /       |        \
                                   Events   Failure rules  Assertions
                                          \       |       /
                                      Trace + Redactor
                                              |
                                    JSON / JUnit / exit code
```

## Monorepo layout

```text
hookguard/
  LICENSE
  README.md
  CONTRIBUTING.md
  CODE_OF_CONDUCT.md
  SECURITY.md
  CHANGELOG.md
  .github/workflows/ci.yml
  .github/ISSUE_TEMPLATE/
  .github/PULL_REQUEST_TEMPLATE.md
  docs/architecture.md
  docs/scenario-reference.md
  docs/security-model.md
  docs/examples.md
  packages/
    schema/           # strict scenario and result schemas
    engine/           # seeded event schedule, injections, assertions
    cli/              # run / validate / init / examples
    action/           # optional: add only after stable CLI
  examples/
    express-consumer/ # intentionally faulty & fixed modes
    scenarios/        # duplicate, reorder, retry, signature, invalid input
  tests/
    e2e/
  pnpm-workspace.yaml
  package.json
  pnpm-lock.yaml
  tsconfig.base.json
```

## Core typed contracts (illustrative, refine with unit tests)

```ts
type FailureMode = 'none' | 'timeout' | 'http_429' | 'http_503';
type ScenarioType = 'duplicate' | 'out_of_order' | 'retry' | 'bad_signature' | 'invalid_payload';

interface ScenarioV1 {
  version: 1;
  name: string;
  scenario: ScenarioType;
  fixture: { path: string; eventIdPath: string };
  seed?: number;
  execution: {
    count?: number;
    timeoutMs: number;
    retry?: { maxAttempts: number; backoffMs: number; statuses: number[] };
    fail?: FailureMode;
  };
  assertions: Array<
    | { kind: 'http_status'; expected: number | number[] }
    | { kind: 'state_json'; url: string; jsonPath: string; equals: unknown }
    | { kind: 'delivery_count'; expected: number }
  >;
  security: { allowTargets: string[]; redactPaths: string[] };
}

interface RunResultV1 {
  schemaVersion: 1;
  name: string;
  seed: number;
  startedAt: string;
  attempts: Array<{ sequence: number; status?: number; durationMs: number; errorCode?: string }>;
  assertions: Array<{ kind: string; passed: boolean; detail: string }>;
  passed: boolean;
}
```

## Sample scenario

```yaml
version: 1
name: payment-captured-duplicate
scenario: duplicate
fixture:
  path: ./fixtures/payment-captured.json
  eventIdPath: $.id
seed: 42
execution:
  count: 3
  timeoutMs: 2000
assertions:
  - kind: http_status
    expected: 200
  - kind: delivery_count
    expected: 3
  - kind: state_json
    url: http://127.0.0.1:3000/_test/state
    jsonPath: $.orders.order_123.creditsApplied
    equals: 1
security:
  allowTargets:
    - http://127.0.0.1:3000
  redactPaths:
    - $.headers.authorization
    - $.body.customer.email
```

> **Important semantics:** a 200 response does not prove idempotency; the `state_json` assertion checks the consumer's observable state in a demo-only test endpoint. Production integrations must not expose such endpoints publicly.

## CLI commands and exit codes

```text
hookguard init [--template express]     create example config locally
hookguard validate -c hookguard.yaml         validate config only; no network
hookguard run -c hookguard.yaml --target ...  execute safe local scenarios
hookguard report --input result.json    transform result to JUnit / HTML (later)
hookguard --help                        usage and examples
```

- 0 = passed; 1 = assertion failed; 2 = configuration/usage error; 3 = unsafe target or security policy rejection; 4 = unexpected runtime error. Never suppress nonzero on failed tests.

## Delivery engine state machine

`PENDING -> DISPATCHING -> OBSERVED -> (RETRY_WAIT -> DISPATCHING)* -> ASSERTING -> PASS|FAIL`.

Runner compiles the scenario into **ordered immutable execution steps** using a seeded PRNG. A scenario adapter sends typed, bounded HTTP requests to an explicitly permitted target. Every attempt logs sanitized metadata, not secrets. Assertions operate over the full trace and optional read-only state probes. Reports embed schema version, scenario hash and engine version to prevent comparing unrelated runs as identical.

## Security design and threat model

- **Localhost-only by default.** A non-local target requires `--allow-remote` **and** explicit exact-host allowlist; disallow link-local, RFC1918 and metadata IPs unless specifically approved for authorized development (ideally no support in v1).
- Resolve DNS safely and protect against DNS rebinding and redirect escapes; by default disallow redirects entirely. Preserve allowlist across redirects if enabled later.
- No arbitrary shell commands from YAML; do not evaluate JavaScript/YAML expressions.
- Cap request/response payload sizes and concurrency, implement timeouts and maximum retries.
- No webhook secrets in logs, reports, examples, CLI arguments where shell history might expose them; support environment variable reading or ephemeral files.
- Use synthetic fixtures only; never record or replay live production/customer data.
- Minimal permissions for GitHub Actions and pinned dependencies. Produce SBOM and check licenses before releases.
- Security reports go privately to maintainer per SECURITY.md.

## Test strategy

1. Schema/config parser: 50+ valid/invalid cases, strict version handling.
2. Determinism: same seed and fixture produces same event ordering and result assertions.
3. Delivery: 2xx, 4xx, 429 with Retry-After, 503, abort, connection refused, timeout, malformed response.
4. Signature: HMAC validation positive/negative, timing-safe sample verifier, stale timestamp, body tampering.
5. Idempotency: faulty sample consumer fails exactly-once assertion; corrected sample passes.
6. Security: deny remote targets without consent, denied redirects, SSRF tests, path traversal, payload caps, redaction.
7. CLI: help, invalid args, exit code contract, JSON and JUnit schema.
8. E2E: run against ephemeral localhost example without paid dependencies; no flaky wall-clock waits.

## Operating model

Version artifacts and CLI via semver; use release checklist. Provide an actionable compatibility policy, test matrix for active supported Node releases, and reproducible commands. Avoid adding UI/backend until users repeatedly ask.

## GitHub remote / package naming

- GitHub remote: `https://github.com/BommepalliRoop/hookguard.git`
- Workspace root: `hookguard/`
- CLI executable: `hookguard`
- Suggested internal packages: `@hookguard/schema`, `@hookguard/engine`, `@hookguard/cli`; **verify npm scope ownership before any publish**. Local workspace packages can use private names during development.
- Initial user-visible version: `0.1.0-alpha.1` *only after* tests, code audit and explicit publish permission.

## Optional future dashboard (not part of MVP)

If and only if real users request a visual interface, add a React/Vite/TypeScript dashboard with local report import and no compulsory server. Use **GPT-6.2 Sol** for implementation, **GPT-6.1 Terra** for browser/screenshots/accessibility visual verification, **GPT-6.2 Astra** for threat-model and architecture review.