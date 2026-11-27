# Fastify webhook consumer demo

From the repository root, install the workspace dependencies, build the
examples and CLI, and start the Fastify consumer.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @hookguard/fastify-consumer start
```

In a second terminal, run the synthetic duplicate-payment scenario against a
fresh consumer.

```sh
node packages/cli/dist/index.js run --config examples/scenarios/duplicate.yaml --target http://127.0.0.1:3000/webhook
```

The default fixed mode returns HTTP 200 for all three deliveries and applies
one credit. To reproduce the failure, stop the consumer, set
`HOOKGUARD_DEMO_MODE=buggy`, and start it again. The same scenario observes
three credits and exits with code 1.

| Environment variable | Default | Behavior |
| --- | --- | --- |
| `HOOKGUARD_DEMO_MODE` | `fixed` | `fixed` applies one credit per event ID. `buggy` applies a credit for every successful delivery. |
| `HOOKGUARD_DEMO_PORT` | `3000` | Sets the loopback port. Use `0` to let the OS choose an available port. |
| `HOOKGUARD_DEMO_FAIL_FIRST` | `0` | Returns HTTP 503 for the first N valid deliveries before applying credits. |

The demo listens on `127.0.0.1` and accepts unsigned synthetic
`payment.captured` JSON at `POST /webhook` and `POST /`. Read an order's
`creditsApplied` at `GET /_test/state`. Invalid payments return HTTP 400.
State is held in memory and resets when the process restarts.
