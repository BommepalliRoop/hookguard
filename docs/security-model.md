# HookGuard security model

HookGuard runs synthetic scenarios against local test consumers. Use a dedicated
test process and non-sensitive fixtures. Anyone who can edit a scenario can
choose paths and payloads on its allowed origins, including paths that change
the state of a local service. Review the scenario and isolate its consumer from
production data before running it.

## Network and files

- The runner only accepts explicit HTTP or HTTPS loopback origins in the
  scenario allowlist. Supported hosts are `localhost`, `127.0.0.1`, and
  `[::1]`. The port and protocol must match the allowlist.
- HookGuard rewrites `localhost` to `127.0.0.1` before opening a socket. The
  runner uses IP literals throughout and does not consult DNS for targets.
- HTTP 3xx responses stop the run at the headers, including redirects from
  read-only state probes. A `Location` header never becomes a request.
- Requests have a deadline and request and response bodies are capped at 1 MiB.
  TLS verification remains enabled for HTTPS.
- Fixtures are regular files inside the scenario directory, subject to a 1 MiB
  limit. Use synthetic data throughout the scenario, including names, URLs,
  assertion values, and fixtures.

## Synthetic HMAC and timestamp checks

The generic signature format uses HMAC-SHA256 over the ASCII Unix timestamp in
seconds, a period, and the exact request bytes. The timestamp is sent in
`X-HookGuard-Timestamp`. The signature is sent in `X-HookGuard-Signature` as
`sha256=` followed by 64 lowercase hexadecimal characters.

Set `HOOKGUARD_SIGNING_SECRET` to the same synthetic value in the runner and
Express demo terminals. The runner requires the variable for these scenarios.

| Scenario | Expected demo response |
| --- | --- |
| [signed_payload](../examples/scenarios/signed-payload.yaml) | 200 for a valid, fresh signature. |
| [bad_signature](../examples/scenarios/bad-signature.yaml) | 401 for a signature with a mismatched digest. |
| [stale_signature](../examples/scenarios/stale-signature.yaml) | 401 for an otherwise valid signature timestamped 600 seconds in the past. |

For example, after building the workspace, start the signed demo in a terminal.

```sh
HOOKGUARD_SIGNING_SECRET=synthetic-example pnpm --filter @hookguard/express-consumer start
```

Run each scenario in a second terminal with the same synthetic value.

```sh
HOOKGUARD_SIGNING_SECRET=synthetic-example node packages/cli/dist/index.js run \
  --config examples/scenarios/signed-payload.yaml --target http://127.0.0.1:3000/webhook
```

An expected 401 passes the scenario. The demo rejects malformed signatures
before applying credits and compares matching-format digests in constant time.
It allows at most 300 seconds of clock skew in either direction. Clock skew can
reject legitimate events. A replay inside this window can still verify, so the
fixed consumer also deduplicates event IDs. Its deduplication state is in memory
and resets on process restart.

Provider signature formats, replay guarantees, durable idempotency, and
permission checks depend on the actual consumer. Passing local examples checks
the supplied fixture and assertions under their specific conditions.
