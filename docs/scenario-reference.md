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
