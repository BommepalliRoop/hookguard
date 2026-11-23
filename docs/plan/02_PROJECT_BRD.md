# BRD — Webhook Reliability Matrix (WRM)

## Problem

Many teams correctly receive webhooks under ideal conditions but fail when events are delivered twice, out of order, with changed signatures, during transient errors, or after worker restarts. Failures may cause duplicate orders, credits, notifications, or lost actions. Existing tooling includes request inspectors and delivery/replay solutions. Our differentiator is **a deterministic, offline-first test harness that verifies consumer behavior and produces CI-readable evidence**, not another hosted webhook inbox.

**Competitor/related project awareness:** [Webhook.site](https://github.com/webhooksite/webhook.site) is an open-source inspector; [requeue](https://github.com/requeue-hq/requeue) covers dead-letter and replay; other open-source tools already test retry, signatures and idempotency. Validate our distinct value with users before expanding. Avoid claiming novelty without evidence.

## Product statement

> Given a local webhook consumer endpoint and a YAML scenario, run repeatable delivery/failure simulations and check observable correctness, then output a machine-readable report and actionable CI failure.

### Target users

- Node.js/Express/Fastify/Hono API developers
- SaaS engineers building payment/order/messaging integrations
- QA engineers writing reliability tests for webhook consumers
- Maintainers integrating third-party events into open-source apps

### Primary use cases

1. `duplicate_delivery`: same event ID delivered N times, business effect asserted **once** by an explicit observable state assertion (not inferred solely from HTTP 2xx).
2. `out_of_order`: deliver a declared event sequence in alternative orders, assert final state.
3. `transient_error`: simulate handler returning 500/503 and retry according to configured retry policy; assert eventual outcomes.
4. `signed_payload`: construct correct and incorrect HMAC signatures using provider-specific fixtures or generic HMAC; test response policy.
5. `timestamp_replay`: check stale or future timestamps are rejected if consumer's security requirements specify a window.
6. `invalid_schema`: send malformed events and verify no unexpected side effects.
7. `ci_regression`: fail a PR pipeline on reproducible reliability regressions, preserve a redactable report.

### Must-have MVP

- MIT license (only if project is individually owned and original), README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR templates, example app.
- TypeScript CLI that reads YAML, validates JSON Schema/Zod, generates deterministic fixtures, and sends to **explicit local targets only by default**.
- Test scenarios for duplicates, ordering, invalid signatures, retry/backoff, invalid JSON.
- Assertions for HTTP status + optional **read-only state probe** to verify idempotent business outcomes.
- JSON and JUnit XML reports; redaction; nonzero process exit code for failures.
- Unit/integration tests, GitHub Actions CI, changelog, tagged beta release.

### SHOULD-have (after validated MVP)

- Consumer adapters/examples: Express, Fastify, Hono, Flask.
- GitHub Action reusable wrapper pinned to versions and without surprise network calls.
- HTML report generated locally; scenario timeline; fixture library.
- Distinguish simulated failures from real network/timeouts; audit replay state.

### OUT OF SCOPE initially

- Hosted SaaS, user accounts, billing, multi-tenancy, arbitrary internet webhook proxy, penetration testing, production event capture, Stripe/META credentials, actual external webhooks, LLM API dependency, real payments, heavy dashboard.

## Functional requirements and acceptance criteria

| ID | Requirement | Verifiable acceptance |
| --- | --- | --- |
| FR-01 | Parse/validate scenario YAML | Invalid config exits with field-specific error |
| FR-02 | Run local HTTP delivery | Example Express consumer receives fixture |
| FR-03 | Support duplicate event case | Exactly-once observable side effect is checked |
| FR-04 | Support out-of-order case | Scenario sequence is reproducible with seed |
| FR-05 | Support transient failures | Retry count/backoff trace equals configuration |
| FR-06 | Test signatures | Correct HMAC accepted, tampering/stale timestamp rejected in sample app |
| FR-07 | Generate reports | JSON/JUnit reports are schema-valid, secrets redacted |
| FR-08 | CI integration | `wrm run` exits 0/1; example workflow tests expected pass/fail |
| FR-09 | Plugin interface | Well-tested adapter boundary, backwards-compatible semver policy |

## Non-functional requirements

- Determinism: repeated run with same seed and local fixture yields same relevant result.
- Privacy: no telemetry by default; no raw secret logging; redaction by default.
- Security: reject remote targets by default, require opt-in allowlist; SSRF mitigations; timeout/size caps; safe file paths.
- Usability: start-to-first-test in <10 minutes on maintained Node LTS, without cloud accounts.
- Quality target: >=85% engine statement/branch test coverage as an internal goal; critical paths and negative tests mandatory.
- Compatibility: document supported Node and TypeScript versions based on active LTS; pin lockfile.
- Accessibility: any optional UI must support keyboard navigation and WCAG AA review.

## Success metrics (real, not manufactured)

- 5 independent real projects running CLI in CI within 6 months (stretch).
- 10 meaningful bug reports/feature requests from actual outside users.
- 2+ independent merged external contributions (early target), 20+ unique *external* merged contributors only as a long-term stretch route.
- A public reproducible README showing a real duplicate-side-effect regression being detected.

## Ownership and IP

Use only original code, permitted third-party packages, and materials you personally have rights to publish. **Do not publish employer proprietary code, configurations, customer payloads, tokens, or internal business logic.** No close copying from competing projects.