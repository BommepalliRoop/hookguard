# Changelog

Released changes follow the principles of [Keep a Changelog](https://keepachangelog.com/). See the [release instructions](docs/release.md) for versioning and approval gates.

## Unreleased

### Added

- Offline validation of strict YAML and JSON scenarios and their local fixtures.
- Loopback webhook delivery for duplicate, retry, and out-of-order scenarios, with business-state assertions.
- Express example consumers that demonstrate a duplicate-credit bug and its idempotent fix.
- JSON and JUnit run reports with scoped state-value redaction.
- HMAC signature fixtures for valid, invalid, and stale signatures.
- Reproducible local CLI alpha packaging with the MIT license and runtime dependency notices.

### Security

- Restrict delivery and state probes to explicit loopback origins and deny redirects.
- Keep raw request and response bodies, headers, and target URLs out of run reports.
