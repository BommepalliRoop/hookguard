# HookGuard

**Local-first, open-source reliability testing for webhook consumers.**

HookGuard is a planned TypeScript CLI for testing webhook receivers against realistic failure scenarios: duplicate delivery, retries, reordered events, invalid signatures, idempotency, timeout handling, and CI regression checks.

> **Status (2026-11-23):** The CLI validates scenarios and delivers synthetic events to explicit loopback targets. The Express demo shows how a state assertion detects duplicate side effects.

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

See [current implementation status](docs/STATUS.md). Read [the project BRD](docs/plan/02_PROJECT_BRD.md), [architecture](docs/plan/03_ARCHITECTURE_HLD_LLD.md), [engineering backlog](docs/plan/04_PROJECT_DELIVERY_BACKLOG.md), and [Codex model routing](docs/plan/12_MODEL_ROUTING_AND_TASK_MATRIX.md).

## Getting started

From a checkout, use Node.js 26 LTS (Node.js 22.13+ and 24 LTS are also in the workspace support range) and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm build
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js validate --config examples/scenarios/duplicate.yaml
```

See the [scenario reference](docs/scenario-reference.md) for supported fields and [Contributing](CONTRIBUTING.md) for development checks.

Run the [Express demo](examples/express-consumer/README.md) on port 3000, then run the duplicate scenario from the checkout:

```sh
node packages/cli/dist/index.js run --config examples/scenarios/duplicate.yaml --target http://127.0.0.1:3000
```

The buggy receiver applies three credits and the CLI exits 1. The fixed receiver applies one credit and the CLI exits 0.

## Open-source participation

Please read [Contributing](CONTRIBUTING.md) and [Security](SECURITY.md) before contributing. All contributions must be original or appropriately licensed, include tests where applicable, and respect maintainer feedback.

## License

[MIT License](LICENSE) for the repository's original contents. Contributed code must respect the contributor's authority to license it; do not copy employer or third-party proprietary material.
