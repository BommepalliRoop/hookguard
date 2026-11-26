# Express webhook consumer demo

From the repository root, build and start the local consumer.

```sh
pnpm --filter @hookguard/express-consumer build
pnpm --filter @hookguard/express-consumer start
```

The consumer binds to `127.0.0.1:3000` by default. It accepts synthetic
`payment.captured` JSON at `POST /` and `POST /webhook`. Read each order's
`creditsApplied` count at `GET /_test/state`. State resets when the process
restarts.

| Environment variable | Default | Behavior |
| --- | --- | --- |
| `HOOKGUARD_DEMO_MODE` | `fixed` | `fixed` applies one credit per event ID. `buggy` applies a credit on every successful delivery. |
| `HOOKGUARD_DEMO_PORT` | `3000` | Sets the loopback listener port. Use `0` to let the system choose an available port. |
| `HOOKGUARD_DEMO_FAIL_FIRST` | `0` | Returns HTTP 503 on the first N valid deliveries before applying credits. Invalid events return HTTP 400. |

Run the [duplicate scenario](../scenarios/duplicate.yaml) against a fresh
consumer on the default port. Three deliveries of the same event apply one
credit in fixed mode and three credits in buggy mode. The scenario expects
one credit.

See the [security model](../../docs/security-model.md#synthetic-hmac-and-timestamp-checks) to enable signed deliveries and run the replay-window example.
