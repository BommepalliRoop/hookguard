# Contributing to HookGuard

Thanks for helping build reliable, testable webhook integrations.

## Before you start
1. Check existing issues and discuss larger changes before starting.
2. Keep proposals focused on real webhook reliability problems.
3. Use original or properly licensed code, and disclose AI assistance when relevant.
4. Include automated tests, reproducible steps and documentation for behavior changes.
5. Do not submit synthetic issues, mass-generated pull requests, secrets or live customer payloads.

## Development

Use Node.js 26 LTS and pnpm 11.25.0. Node.js 22.13+ and 24 LTS are also supported by the toolchain.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
pnpm test:coverage
```

Use `pnpm format` to apply formatting, and `python scripts/check_docs.py` to check local documentation links. See the [roadmap](docs/plan/04_PROJECT_DELIVERY_BACKLOG.md) for planned product features.

## Pull requests
Explain the problem, solution, test evidence and remaining risks. Maintainers may request changes or decline PRs that aren't aligned with the roadmap. Be respectful of contributors and reviewers.

## Security
Report vulnerabilities through the process in [SECURITY.md](SECURITY.md), rather than publishing exploits or credentials in an issue.
