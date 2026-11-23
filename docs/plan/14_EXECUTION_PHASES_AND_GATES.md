# 14 — HookGuard Delivery Plan: Phases, Dependencies and Gates

**Use:** `09_CODEX_MASTER_PROMPT.md` together with this file and `12_MODEL_ROUTING_AND_TASK_MATRIX.md`. Each phase requires actual verification; a written checklist is not proof of implementation.

| Phase | Work | Backlog IDs | Primary | Exit gate |
|---|---|---|---|---|
| 0 / Identity | Real repo and legal ownership audit, model routing | HG-001–006 | Astra | Can legally publish original OSS code; repository status confirmed |
| 1 / Engineering base | pnpm/TypeScript, lint, test, CI, templates | HG-007–010 | Sol | `pnpm install`, lint/typecheck/tests work locally |
| 2 / Contracts | Scenario and result v1, parser and fixtures | HG-011–020 | Sol + Astra on schema decisions | Valid/invalid YAML & JSON contract tests pass |
| 3 / Engine | Safe local HTTP, deterministic duplicate/reorder/retry and observability | HG-021–030 | Sol; Astra reviews safety/races | Buggy receiver fails; fixed receiver passes; no remote requests |
| 4 / Security+Reports | Result/JUnit, tamper/replay tests, SSRF defense, redaction | HG-031–040 | Astra + Sol | Fail-closed checks, reproducible e2e evidence and code review |
| 5 / Alpha | DX, examples, release docs, npm metadata, optional Action | HG-041–050 | Sol + Astra release gate | Alpha approved and users can run quickstart |
| 6 / Adoption | More adapters, feedback, compatibility, stable release | HG-051–060 | Sol; Astra stability | Genuine users and stable quality proven; release authorized |
| 7 / External OSS | Investigate each EXT-001 through EXT-100 sequentially | 100 research slots | Astra discovery; Sol fix; Astra review | **No credit until real upstream merger confirmed** |
| 8 / Application | Applicant eligibility audit and submission | Independent evidence from 00, 06, 07, 10 | Astra | One qualifying track + general conditions met; program still open |

## Critical demo path

1. Run a local Express webhook consumer in **buggy mode**.
2. `hookguard validate -c examples/scenarios/duplicate.yaml` exits 0 without network.
3. `hookguard run -c examples/scenarios/duplicate.yaml --target http://127.0.0.1:3000` sends same synthetic payment event 3 times.
4. Test-only state probe reports three credits applied instead of exactly one. HookGuard exits 1 with understandable failed assertion.
5. Restart in **fixed mode** using event-id idempotency. Rerun and assert exactly one credit. HookGuard exits 0.
6. JSON/JUnit reports preserve evidence but not secrets. `pnpm test` includes e2e regression for both cases.

## Build rules

- Implement runnable production-grade functionality, not TODO-only scaffolds or mock proofs.
- No network fetch to unapproved external URLs. Localhost is permitted with explicit target allowlist, redirect denial and caps.
- Separate test-runner behavior from the consumer fixture: tests must catch consumer flaws rather than artificially mark success.
- One coherent issue/change per reviewable PR. Own-repo PR count is irrelevant to 100 external PRs.
- Stop before remote push, publishing package, deploying, incurring costs, submitting upstream PR, or sending applications unless the user authorizes the action.
- Always report exact test commands, passing/failing cases and unimplemented scope.

## Completion definition

**Documentation complete** means files and execution instructions exist. **MVP complete** means the critical demo and security suite actually run. **Public release complete** means user approves publish and GitHub shows the code/release. **External PR qualifying** means GitHub shows an authentic merged PR to a third-party repo. **Claude eligibility complete** means a live audit proves all prerequisites, not when a tracker reaches 100 planned slots. **Claude sponsorship awarded** means Anthropic approves; no model can guarantee that result.