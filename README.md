# HookGuard

**Local-first, open-source reliability testing for webhook consumers.**

HookGuard is a planned TypeScript CLI for testing webhook receivers against realistic failure scenarios: duplicate delivery, retries, reordered events, invalid signatures, idempotency, timeout handling, and CI regression checks.

> **Status (2026-11-23):** Planning/bootstrap. The implementation is **not yet built or tested**. Do not mistake planned features for working code.

## What we'll build

- CLI that replays synthetic webhook deliveries against explicit localhost/allowlisted endpoints
- Deterministic test scenarios (duplicate, delayed, reordered and retried events)
- Assertion engine for response handling, retry behavior and idempotency
- Signature fixtures and verification tests with configurable algorithms
- Human-readable reports plus machine-readable JSON/JUnit
- GitHub Actions examples for CI; no paid services or AI API calls required

## Roadmap

1. Repository setup, test fixtures, safe endpoint validation, first CLI command
2. Scenario runner and assertions
3. Signatures, idempotency and retry simulation
4. Reports, example consumer and CI
5. Documentation, security hardening and tagged releases
6. Optional web UI only after a useful CLI is stable

Read [the project BRD](docs/plan/02_PROJECT_BRD.md), [architecture](docs/plan/03_ARCHITECTURE_HLD_LLD.md), [engineering backlog](docs/plan/04_PROJECT_DELIVERY_BACKLOG.md), and [Codex model routing](docs/plan/12_MODEL_ROUTING_AND_TASK_MATRIX.md).

## Getting started

There is no installable version yet. Once the CLI is implemented, this section will include exact working commands. For now, developers can help by reviewing the proposed product scope and opening substantive issues.

## Open-source participation

Please read [Contributing](CONTRIBUTING.md) and [Security](SECURITY.md) before contributing. All contributions must be original or appropriately licensed, include tests where applicable, and respect maintainer feedback.

## License

Licensing is pending maintainer selection; **do not assume permission to reuse the source until an explicit LICENSE file is added**.
