# Security model

HookGuard sends synthetic deliveries to explicitly allowed loopback origins. Origins include scheme, host, and port. The supported hosts are `127.0.0.1`, `[::1]`, and `localhost`, which maps directly to `127.0.0.1` without DNS resolution. Delivery and read-only state probes follow the same policy. Redirect responses stop the scenario. Requests and responses have a 1 MiB limit, with a configured timeout for the entire exchange. HTTPS uses normal certificate verification.

## Local files and input

Scenario YAML and JSON use strict versioned contracts. The loader caps configuration bytes and rejects duplicate keys, aliases, custom YAML tags, and multiple documents. A fixture must be a regular file inside the scenario directory and may contain up to 1 MiB of exact wire bytes. Path and handle checks reduce symlink and replacement risks. Keep scenario directories protected from concurrent untrusted writes because Node.js lacks portable descriptor-relative path traversal.

## Signed synthetic events

Set `HOOKGUARD_DEMO_SIGNING_SECRET` to a synthetic test value in both the demo receiver and CLI environments. Signed scenarios send an HMAC-SHA256 over the ASCII timestamp, one dot, and the exact request body bytes. The receiver requires valid UTF-8 for signed JSON, compares the digest in constant time, and rejects malformed signatures or timestamps outside the configured window. The default window is 300 seconds. The [signature examples](../examples/scenarios/signed-valid.yaml) demonstrate accepted, invalid, stale, and future signatures. Event ID deduplication handles duplicate deliveries within the time window.

## Reports and observable state

Reports contain status, timings, assertion results, and scenario identity metadata. Payload bytes, response bodies, signing headers, and environment variable values stay out of results. `security.redactPaths` suppresses selected state values and masks textual report fields such as `$.name` or `$.assertions[0].detail`. Set it for application-specific sensitive labels and continue to use synthetic data. A state assertion confirms only the observable value exposed by the test endpoint. The demo state endpoint is intended for isolated local tests.
