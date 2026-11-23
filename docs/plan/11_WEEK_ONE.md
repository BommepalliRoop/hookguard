# Week 1 Sprint (Nov 23–29, 2026)

**Objective:** one functional local CLI demo and one genuinely useful external issue investigated. Avoid overcommitting.

## Day 1 — scope, safety, scaffold (Sol for code; Astra for IP/security review)

- [ ] Read the public project BRD, architecture and engineering backlog; distinguish planned features from completed features.
- [ ] Confirm legal right to publish original independent code.
- [ ] Use existing public project name `HookGuard` and verify npm/package namespace availability (do not create a second repo).
- [ ] Create *local-only* TypeScript workspace for the existing `BommepalliRoop/hookguard` repo, strict TS, pnpm scripts and Vitest.
- [ ] Draft MIT license and OSS community docs; publish only after owner confirms.

## Day 2 — define test contract (Astra for schema; Sol for tests)

- [ ] Define schema v1 for YAML scenarios and result JSON.
- [ ] Implement `hookguard validate`, negative tests and error messages.
- [ ] Create deterministic synthetic payment event + two Express consumer modes.

## Day 3 — core duplicate demo (Sol, Astra reviews network safety)

- [ ] Implement safe local HTTP runner, duplicate delivery, attempt logging, redaction.
- [ ] Add state assertion to detect exactly-once business side effect.
- [ ] Prove buggy consumer fails and corrected consumer passes.

## Day 4 — expand scenarios (Sol, Astra security sign-off)

- [ ] Implement signature tampering case with synthetic HMAC.
- [ ] Implement 503 retry case with deterministic attempts.
- [ ] Add invalid JSON and no-secret-log regression tests.

## Day 5 — CI readiness (Sol implementation; Astra review)

- [ ] Add JUnit and JSON report outputs + exit codes.
- [ ] Add lint/typecheck/unit/e2e workflow; run it locally first.
- [ ] Write a quickstart that a stranger can follow without cloud services.

## Day 6 — optional upstream code study (separate from HookGuard; not a project delivery gate)

- [ ] Inspect [ant-design/x issue #2075](https://github.com/ant-design/x/issues/2075); check issue open, duplicates, other PRs, project guidelines and license.
- [ ] Reproduce the icon-spacing issue on current branch.
- [ ] Write failing test and propose small fix **only if still needed and welcome**.
- [ ] Show PR draft and test output to user before submitting upstream.

## Day 7 — QA and review (Astra final gate)

- [ ] Re-run all tests, manually inspect diff, update changelog.
- [ ] Record verified facts, blockers and actual time/spend.
- [ ] Get explicit approval before publishing production releases, new packages or third-party PRs.
- [ ] Replan next week's work based on true project status and any external maintainers' feedback.

## 'Done' looks like

```text
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm --filter @hookguard/cli start -- run --config examples/scenarios/duplicate.yaml --target http://127.0.0.1:3000
```

> Actual commands will depend on the package scripts Codex implements. The demo must have both expected PASS and expected FAIL examples and never use real customer payment/webhook data.