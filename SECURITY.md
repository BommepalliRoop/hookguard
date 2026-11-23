# Security policy

## Current status
HookGuard is under development; no production-ready release exists.

## Report a vulnerability
Please avoid publicly posting working exploits, secret credentials or personal information. Contact the repository owner through GitHub's private vulnerability reporting feature **if enabled**. If unavailable, open a minimal public issue asking for a secure reporting channel without disclosing exploitation details.

## Design principles
- Default to localhost and explicitly approved endpoints to prevent SSRF.
- Reject unsafe redirect targets and unexpected network destinations.
- Store no real webhook secrets or personal information in example fixtures.
- Keep workflows least-privileged and dependency versions maintained.
- Include tests for validation, signatures, replay and idempotency behavior.

This project offers reliability testing, not a guarantee of security.
