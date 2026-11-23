# 12 — Codex Model Routing and Per-Task Matrix

**Project:** HookGuard | **Repository:** https://github.com/BommepalliRoop/hookguard | **Updated:** 2026-11-23

## Default model decision

| Task category | Primary | Reasoning | Second-pass review |
|---|---|---|---|
| General implementation, schemas, docs, tests, CLI, CI | **GPT-6.2 Sol** | Medium | Astra when decisions affect security / architecture |
| System boundaries, schema compatibility, security, threats, releases | **GPT-6.2 Astra** | Medium → High for difficult decisions | Human testing and code review |
| Optional browser UX and visual checks (future only) | **GPT-6.1 Terra** | Medium | Sol for code, Astra for trust boundaries |
| Mechanical bounded edits and ledger maintenance | GPT-6 Luna (optional) | Low | Sol verifies correctness |

Recommendation is a human-controlled model choice in Codex, not an API integration. HookGuard must run fully without any paid AI service. Model capabilities and access may change; follow OpenAI’s current documentation at https://developers.openai.com/api/docs/guides/model-selection.

## Task-by-task model assignments (60)

| Task | Engineering task | Primary model | Effort | Evidence before Done |
|---|---|---|---|---|
| HG-001 | Check repo/package name conflicts; choose final public identity | GPT-6.2 Astra | Medium | Policy/architecture decision documented + tests or proof |
| HG-002 | Confirm personal IP ownership; no employer material | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-003 | Add OSI-approved MIT license, year/author placeholders | GPT-6.2 Astra | Medium | Policy/architecture decision documented + tests or proof |
| HG-004 | Create root README problem/quickstart/limitations | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-005 | Add CONTRIBUTING.md and Code of Conduct | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-006 | Add SECURITY.md and private disclosure instructions | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-007 | Initialize pnpm workspace, strict TS base config | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-008 | Add ESLint, Prettier, .editorconfig and scripts | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-009 | Add test/coverage workflow with minimal permissions | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-010 | Add issue, PR and bug reproduction templates | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-011 | Define ScenarioV1 Zod schema and JSON Schema export | GPT-6.2 Astra | Medium | Policy/architecture decision documented + tests or proof |
| HG-012 | Define RunResultV1 and version policy | GPT-6.2 Astra | Medium | Policy/architecture decision documented + tests or proof |
| HG-013 | Build strict YAML loader with clear errors | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-014 | Implement config validation CLI subcommand | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-015 | Implement fixture path sandbox and size cap | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-016 | Build seedable PRNG and scheduling engine | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-017 | Document CLI commands and exit codes | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-018 | Implement synthetic payment captured fixture | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-019 | Implement schema-negative test matrix | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-020 | Create minimal examples/scenario-reference.md | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-021 | Implement local-target allowlist and URL normalization | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-022 | Implement HTTP runner with timeout and abort | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-023 | Implement bounded response and request limits | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-024 | Implement duplicate scenario scheduler | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-025 | Implement out-of-order event permutation scheduler | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-026 | Implement 429/503 retry policies with jitter control | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-027 | Implement attempt trace and stable scenario hash | GPT-6.2 Astra | Medium | Policy/architecture decision documented + tests or proof |
| HG-028 | Implement status/attempt-count assertions | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-029 | Implement read-only state_json assertion | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-030 | Create real Express demo consumer (faulty and fixed) | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-031 | Implement JSON output with declared result schema | GPT-6.2 Astra | Medium | Policy/architecture decision documented + tests or proof |
| HG-032 | Implement JUnit XML output and escaping | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-033 | Implement deterministic exit code mapping | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-034 | Implement configurable redaction by path | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-035 | Add HMAC signing negative and positive fixtures | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-036 | Add replay-window examples and tests | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-037 | Implement safe redirect denial | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-038 | Implement SSRF/DNS protection regression tests | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-039 | Add confidential secret and log review tests | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-040 | Document security model and false-positive limits | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-041 | Create `hookguard init` guided local template | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-042 | Document Linux/macOS/Windows setup | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-043 | Add e2e tests to GitHub Actions | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-044 | Add 1-minute quickstart walkthrough | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-045 | Add sample generated JSON/JUnit reports | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-046 | Audit dependency licenses and vulnerability notices | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-047 | Prepare changelog and semantic versioning policy | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-048 | Publish signed/tagged alpha after owner approval | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-049 | Prepare package metadata and package-name confirmation | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-050 | Build reusable GitHub Action only after CLI beta passes | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-051 | Add an example Fastify webhook consumer | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-052 | Add an example Hono webhook consumer | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-053 | Publish end-to-end idempotency regression example | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-054 | Add robust 429 Retry-After parsing coverage | GPT-6.2 Astra | Medium | Policy/architecture decision documented + tests or proof |
| HG-055 | Add well-scoped webhook provider fixture guide | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-056 | Add optional HTML report (no new server) | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-057 | Validate on current supported Node LTS versions | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |
| HG-058 | Triaging template for external bug reports | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-059 | Gather user feedback and plan v0.2 scope | GPT-6.2 Sol | Medium | Working change, local test output + docs as applicable |
| HG-060 | Publish first stable release only after user validation | GPT-6.2 Astra | Medium/High | Policy/architecture decision documented + tests or proof |

## External OSS contribution model workflow

1. **Astra / Medium:** inspect live issue, search duplicate PRs, read CONTRIBUTING/license, prove ownership and relevance.
2. **Sol / Medium:** prepare smallest maintainable fix and regression test on an upstream fork after approval.
3. **Terra / Medium (optional):** verify browser reproduction/screenshots if issue is visual.
4. **Astra / Medium/High:** final upstream PR diff audit, privacy/security, tests and documentation.
5. **Human:** authorize submission; upstream maintainers decide whether to merge. After a real merge, verify link/date and update tracker.

## Efficiency rule

If Sol completes a task with tests and reviewer-ready diff, do not rerun the same task in Astra without reason. Reserve Astra for uncertain tradeoffs, vulnerabilities, hard race conditions, breaking changes and release acceptance.