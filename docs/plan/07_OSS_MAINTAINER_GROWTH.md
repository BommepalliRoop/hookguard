# OSS Maintainer and Ecosystem Impact Playbook

## Launching a legitimate OSS project

1. Confirm copyright ownership and no employer/client NDA/contract conflicts. Build original code from scratch.
2. Add **OSI-approved license** (MIT proposed), notice, and any dependency attribution.
3. Ship clean, complete README: problem, user story, quickstart, tests, limitations and support policy.
4. `CONTRIBUTING.md`, CODE_OF_CONDUCT, SECURITY.md, issue/PR templates and a public roadmap.
5. Set CI with test/lint/typecheck/security checks and minimal token permissions. Public releases should be semver tagged.
6. Prefer one reliable CLI over an abandoned dashboard + six microservices.
7. Run a minimal demo that demonstrably fails on a buggy webhook consumer and succeeds on a fixed one.

## Community plan (quality and value first)

- Publish 3 useful example integrations and a troubleshooting guide.
- Invite genuine user feedback through public issues; do not recruit friends to open token PRs.
- Respond to real issues within a sustainable cadence; label `good first issue` only for actual needs with clear reproduction.
- Review incoming contributions fairly, maintain tests, credit authors and avoid self-approving risky changes.
- Maintain changelog, supported versions, releases and a security disclosure channel.
- Ask for permission before using a company's name/logo as a case study.

## Growth ladder and measurement

| Milestone | What counts | Is it itself Anthropic eligibility? |
| --- | --- | --- |
| v0.1 functional | Working local CLI + docs/tests | No |
| 5 real external users | Verifiable installs or public usage (consent respected) | No |
| 2 genuine external merged contributors | Distinct outside people with real changes | No |
| 20 genuine external merged contributors in prior 12m | GitHub verified, distinct users | Potential direct community builder route |
| 500 dependent repositories/100 packages | Registry dependency data | Potential direct library route |
| 200k monthly downloads | Public package registry records | Potential direct download route |
| OpenSSF criticality score >=0.4 | Verified OpenSSF result | Potential direct route |
| Meaningful ecosystem dependents | Evidence of critical adoption even without numeric route | Possible discretionary review |

**Important:** An application requires one threshold + general requirements. Do not buy downloads, reciprocal PRs, fake forks, or ask others to contribute solely to qualify.

## Differentiation to validate with users

- Not 'another public webhook receiver'; CLI runs against locally launched consumer, offline.
- Observable state assertions to catch **business side effects**, rather than only HTTP statuses.
- Deterministic fault injection and anonymized evidence as CI artifacts.
- No hosted dependency, no paid sign-up, explicit safe-target policy.

## 4 proof assets

- 2-minute reproducible terminal demo with a before/after bug test.
- Public CI badge and link to representative passing/failing fixtures.
- 1–2 independent integrations, with permission and links to public repos.
- Release artifacts, test coverage, clear changelog and vulnerability disclosure.

## Optional outreach message (after demonstrable release)

> I maintain an open-source local webhook reliability test runner that checks duplicate delivery and retry behavior with observable assertions. Would a short example help your project's webhook CI? No sponsorship or PR exchange requested. Feedback is welcome.

## HookGuard repository and model assignments

Project home: https://github.com/BommepalliRoop/hookguard; start with genuine issues, responsive triage, CI and accessible docs. Sol can draft user-facing docs and routine issue responses, Astra can evaluate security disclosures and architecture proposals, Terra can visually test optional UI demos. Human maintainership decisions remain human.