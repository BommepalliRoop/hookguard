# Execution blockers

- The Windows native Codex shell runner refused nested worker command startup because the registered Core process had no package identity. Isolated desktop agent sessions and local verification worktrees remain available. The [orchestrator runbook](orchestrator.md) describes the foreground controller and checkpoint resume commands.
- Public release requires verified package scope ownership, explicitly configured publishing credentials, and verified acceptance gates. Stable release also requires genuine user validation and feedback.
- GitHub auto-merge and squash merging are enabled. The default branch has no branch protection or applicable rulesets. Review and CI gates must be verified before merging.
- The public registry returns HTTP 404 for `@hookguard/cli`. Scope ownership and publishing permission remain unverified. GitHub shows no configured repository release secret or environment.
