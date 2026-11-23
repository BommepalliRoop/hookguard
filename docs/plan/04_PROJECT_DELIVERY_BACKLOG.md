# HookGuard — 60 Delivery Tasks (Model Assigned)

> These are 60 independent *engineering tasks*, not 60 completed changes or promised pull requests. Do not artificially split changes for metrics.

## Definition of done for every task
- Technical requirements written down; test before and after for bug fixes.
- Appropriate code + regression test; docs/changelog where relevant.
- Lint/typecheck/unit tests pass and change is reviewed.
- No secrets, third-party IP, generated dumps or hidden network calls.

## M1 — legal/community and scaffold
- [ ] **HG-001** Check repo/package name conflicts; choose final public identity  **Codex:** GPT-6.2 Astra (Medium).
- [ ] **HG-002** Confirm personal IP ownership; no employer material  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-003** Add OSI-approved MIT license, year/author placeholders  **Codex:** GPT-6.2 Astra (Medium).
- [ ] **HG-004** Create root README problem/quickstart/limitations  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-005** Add CONTRIBUTING.md and Code of Conduct  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-006** Add SECURITY.md and private disclosure instructions  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-007** Initialize pnpm workspace, strict TS base config  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-008** Add ESLint, Prettier, .editorconfig and scripts  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-009** Add test/coverage workflow with minimal permissions  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-010** Add issue, PR and bug reproduction templates  **Codex:** GPT-6.2 Sol (Medium).

## M2 — scenario contracts
- [ ] **HG-011** Define ScenarioV1 Zod schema and JSON Schema export  **Codex:** GPT-6.2 Astra (Medium).
- [ ] **HG-012** Define RunResultV1 and version policy  **Codex:** GPT-6.2 Astra (Medium).
- [ ] **HG-013** Build strict YAML loader with clear errors  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-014** Implement config validation CLI subcommand  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-015** Implement fixture path sandbox and size cap  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-016** Build seedable PRNG and scheduling engine  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-017** Document CLI commands and exit codes  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-018** Implement synthetic payment captured fixture  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-019** Implement schema-negative test matrix  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-020** Create minimal examples/scenario-reference.md  **Codex:** GPT-6.2 Sol (Medium).

## M3 — execution engine
- [ ] **HG-021** Implement local-target allowlist and URL normalization  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-022** Implement HTTP runner with timeout and abort  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-023** Implement bounded response and request limits  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-024** Implement duplicate scenario scheduler  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-025** Implement out-of-order event permutation scheduler  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-026** Implement 429/503 retry policies with jitter control  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-027** Implement attempt trace and stable scenario hash  **Codex:** GPT-6.2 Astra (Medium).
- [ ] **HG-028** Implement status/attempt-count assertions  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-029** Implement read-only state_json assertion  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-030** Create real Express demo consumer (faulty and fixed)  **Codex:** GPT-6.2 Sol (Medium).

## M4 — security and reports
- [ ] **HG-031** Implement JSON output with declared result schema  **Codex:** GPT-6.2 Astra (Medium).
- [ ] **HG-032** Implement JUnit XML output and escaping  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-033** Implement deterministic exit code mapping  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-034** Implement configurable redaction by path  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-035** Add HMAC signing negative and positive fixtures  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-036** Add replay-window examples and tests  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-037** Implement safe redirect denial  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-038** Implement SSRF/DNS protection regression tests  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-039** Add confidential secret and log review tests  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-040** Document security model and false-positive limits  **Codex:** GPT-6.2 Astra (Medium/High).

## M5 — DX and release
- [ ] **HG-041** Create `hookguard init` guided local template  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-042** Document Linux/macOS/Windows setup  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-043** Add e2e tests to GitHub Actions  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-044** Add 1-minute quickstart walkthrough  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-045** Add sample generated JSON/JUnit reports  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-046** Audit dependency licenses and vulnerability notices  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-047** Prepare changelog and semantic versioning policy  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-048** Publish signed/tagged alpha after owner approval  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-049** Prepare package metadata and package-name confirmation  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-050** Build reusable GitHub Action only after CLI beta passes  **Codex:** GPT-6.2 Astra (Medium/High).

## M6 — adoption and stabilization
- [ ] **HG-051** Add an example Fastify webhook consumer  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-052** Add an example Hono webhook consumer  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-053** Publish end-to-end idempotency regression example  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-054** Add robust 429 Retry-After parsing coverage  **Codex:** GPT-6.2 Astra (Medium).
- [ ] **HG-055** Add well-scoped webhook provider fixture guide  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-056** Add optional HTML report (no new server)  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-057** Validate on current supported Node LTS versions  **Codex:** GPT-6.2 Astra (Medium/High).
- [ ] **HG-058** Triaging template for external bug reports  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-059** Gather user feedback and plan v0.2 scope  **Codex:** GPT-6.2 Sol (Medium).
- [ ] **HG-060** Publish first stable release only after user validation  **Codex:** GPT-6.2 Astra (Medium/High).

**Total tasks:** 60; treat adjacent tasks as one PR where a cohesive review is better. Use `12_MODEL_ROUTING_AND_TASK_MATRIX.md` for per-task checklists and escalation rules.

**Checkpoint:** Task 60 is not complete merely because Codex generates code. Check actual tests, usability, quality review, published release, and independently verified external user feedback.