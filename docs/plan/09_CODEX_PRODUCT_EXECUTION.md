# Codex implementation brief — HookGuard (public product only)

## Mission
Develop a deterministic, local-first reliability test runner for webhook consumers. This document addresses *product engineering only*. Personal subscriptions, eligibility programs, budgets and third-party PR trackers do not belong in this repository.

## Read order
1. [BRD](02_PROJECT_BRD.md)
2. [Architecture](03_ARCHITECTURE_HLD_LLD.md)
3. [60-task backlog](04_PROJECT_DELIVERY_BACKLOG.md)
4. [Model routing](12_MODEL_ROUTING_AND_TASK_MATRIX.md)
5. [Phase gates](14_EXECUTION_PHASES_AND_GATES.md)
6. [Week 1](11_WEEK_ONE.md)
7. Root [AGENTS.md](../../AGENTS.md)

## Recommended model selection
- **GPT-6.2 Sol / Medium**: normal TypeScript implementation, unit/integration tests, CLI commands, examples, docs and GitHub Actions.
- **GPT-6.2 Astra / Medium or High**: architecture/security review, SSRF prevention, redirect/allowlist handling, determinism, race conditions and final release gate.
- **GPT-6.1 Terra**: optional visual QA only if a dashboard is later added.
- **GPT-6 Luna**: optional bounded documentation tasks.
These are **human-selected suggestions**, not automatically configured models. Use only models accessible in the user's environment.

## Phase sequence
- M0: check IP/licensing status and current source tree. Do not overwrite existing files.
- M1: implement a strict TypeScript/pnpm workspace, lint, type-check, tests and CI.
- M2: versioned scenario YAML/JSON schema and CLI validate command.
- M3: bounded local HTTP runner, deterministic duplicate/retry/reordering scenarios and example receiver.
- M4: real assertions of business side effects, signature validation, JSON/JUnit reports and security regression tests.
- M5: docs, packaging, release rehearsal and compatibility tests.

## Quality and safety
- No live payment credentials, production payloads, hosted AI integrations or paid services.
- Restrict targets to localhost by default; deny redirects and enforce limits to avoid SSRF.
- Add tests with real before/after demonstration; never claim they passed unless executed.
- No package publishing, external PR submission or production deployment without owner authorization.
- The public repository may already have docs and workflows; inspect its actual default branch first.

## Required output from every Codex execution
1. Current phase and HG-task IDs.
2. Files actually changed.
3. Commands run and *actual* test results.
4. Unresolved defects and security/IP concerns.
5. Next implementation task. **No false completion claims.**

**Start:** Implement M1 with a testable source scaffold, then run tests.
