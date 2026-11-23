# Scenario reference

Run `hookguard validate --config examples/scenarios/duplicate.yaml` after building the workspace. Validation reads YAML and fixture files locally. The [duplicate example](../examples/scenarios/duplicate.yaml) uses a [synthetic payment](../examples/scenarios/fixtures/payment-captured.json) and expects one credit after three deliveries.

## Version 1

| Field | Meaning |
| --- | --- |
| `version` | Schema version. Use `1`. |
| `name` | Label for the scenario and its report. |
| `scenario` | `duplicate`, `out_of_order`, `retry`, `bad_signature`, or `invalid_payload`. |
| `fixture.path` | Regular file relative to the scenario directory. The size limit is 1 MiB. |
| `fixture.eventIdPath` | Simple JSONPath for an event identifier, such as `$.id`. |
| `seed` | Optional unsigned 32-bit integer for deterministic scheduling. |
| `execution` | Delivery count, timeout, optional retry policy, and simulated failure. |
| `assertions` | One or more HTTP status, delivery count, or read-only JSON state expectations. |
| `security` | Explicit allowed origins and a list of redaction paths. |

Use `http_status` with one expected status or a list. Use `delivery_count` with the expected number of attempts. Use `state_json` with a read-only endpoint, simple JSONPath, and the expected JSON value. A status check verifies the HTTP response. The state probe verifies the observable business effect.

The CLI exit codes are 0 for success, 1 for a failed scenario assertion, 2 for configuration or usage errors, 3 for target policy rejection, and 4 for unexpected runtime failures.

## Delivery and retries

`run` sends events to an explicit loopback origin listed in `security.allowTargets`. A state probe uses GET and must also use an allowed origin. Redirect responses stop execution.

Duplicate scenarios send the original bytes to the same target for each delivery. An out-of-order fixture is a JSON array of events. Its seed produces a repeatable order. A retry policy sets `maxAttempts`, fixed `backoffMs`, optional seeded `jitterMs`, and retryable HTTP `statuses`. For retryable 429 and 503 responses, a longer valid `Retry-After` can increase the delay up to 60 seconds.

`http_status` evaluates the last attempt of each delivery. `delivery_count` counts all attempts, including retries. `state_json` reads the observed state after delivery.

## Signatures and reports

Optional `security.signature` specifies a `secretEnv` name starting with `HOOKGUARD_`, an optional `mode` of `valid`, `invalid`, `stale`, or `future`, and an optional `toleranceSeconds`. The default window is 300 seconds. A `bad_signature` scenario defaults to invalid mode; other signed scenarios default to valid.

Use `run --json result.json --junit result.xml` to write new report files. Use `report --input result.json --format junit` to convert a saved result. See the [security model](security-model.md) for redaction and state-probe limits.
