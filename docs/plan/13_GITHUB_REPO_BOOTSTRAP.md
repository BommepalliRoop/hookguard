# HookGuard GitHub bootstrap — current source of truth

Repository: https://github.com/BommepalliRoop/hookguard

**Verified 2026-11-23:** The public repository has been initialized and uses the non-standard default branch `BommepalliRoop_ProgFunda`. It contains documentation and community governance files; no working HookGuard CLI source has been verified. Never assume the default branch is `main`.

## Before editing
1. Clone the repository and inspect `git status`, `git branch -a` and the file tree.
2. Read `AGENTS.md` and `docs/plan/09_CODEX_PRODUCT_EXECUTION.md`.
3. Preserve existing docs; correct any stale statements using verifiable test results.
4. Confirm independent ownership of new code and that no employer/customer IP is included.

## First development batch
- Initialize pnpm/TypeScript workspace in a focused feature branch.
- Add scripts for build, lint, type-check, unit tests and a synthetic example consumer.
- Use a scoped localhost-only network policy; fail closed on redirects and unexpected hosts.
- Run the suite locally, then submit a reviewable PR to HookGuard for owner approval.
- Use actual CI output as evidence before marking tasks done.

## Note on repository settings
Default branch renaming, branch protection, package publishing and external contribution submissions are separate intentional owner decisions. Do not change automatically.

There are **not yet 60 completed development tasks**. Planning documents are not implementation evidence.
