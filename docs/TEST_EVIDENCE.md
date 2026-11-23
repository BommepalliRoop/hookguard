# Test evidence

| Batch | Commands and observed results |
| --- | --- |
| Foundation PR #1 | Frozen install, lint, formatting, typecheck, build, CLI smoke, and six tests passed on Node.js 22, 24, and 26. [Engineering run](https://github.com/BommepalliRoop/hookguard/actions/runs/45122507511) · [Documentation run](https://github.com/BommepalliRoop/hookguard/actions/runs/45122507477) |
| Original orchestrator PR #2 head | The matrix passed 70 tests per Node.js version. The independent review found follow-up issues that require new verification. [Original engineering run](https://github.com/BommepalliRoop/hookguard/actions/runs/45127438117) |
| Phase 2 contracts on Windows Node.js 22 | `pnpm test` passed 182 tests in 13 files. `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm format:check`, frozen offline install, documentation links, and compiled CLI validation passed. |
| Phase 3 worker checks | The 26 transport tests, 63-test engine worker suite, and three Express consumer tests passed in isolated worktrees. The Express startup smoke observed 3 credits in buggy mode and 1 in fixed mode. |
| Phase 3 combined product checks on Windows Node.js 22 | The focused run passed 207 tests in 11 files. Typecheck and the four package builds passed. The compiled CLI exited 1 against the buggy consumer with three credits, then exited 0 against the fixed consumer with one credit. |
| Phase 3 full rerun | All 268 tests passed on Windows after bounding test parallelism and extending the subprocess test timeout. |
| Phase 4 signing and reports on Windows Node.js 22 | The initial full suite passed 313 tests. The final targeted rerun passed 11 signed-delivery and Express tests after adding fail-closed checks for empty secrets and alternate charsets. Typecheck and workspace build passed. |
