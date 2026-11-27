# Hono webhook consumer demo

From the repository root, install and build the workspace. Start the consumer
in its default fixed mode.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @hookguard/hono-consumer start
```

The demo listens on `127.0.0.1:3000` by default. Send synthetic
`payment.captured` JSON to `POST /webhook` or `POST /`. Use
`GET /_test/state` to read each order's `creditsApplied` count. All state
resets with the process.

| Environment variable | Default | Behavior |
| --- | --- | --- |
| `HOOKGUARD_DEMO_MODE` | `fixed` | `fixed` applies one credit per event ID. `buggy` applies a credit for every successful delivery. |
| `HOOKGUARD_DEMO_PORT` | `3000` | Sets the loopback port. Use `0` to have the OS pick an available port. |
| `HOOKGUARD_DEMO_FAIL_FIRST` | `0` | Returns HTTP 503 on the first N valid deliveries, before applying any credits for those deliveries. |

Malformed or oversized JSON and invalid payment events return HTTP 400.
The body limit is 64 KiB.

From a second terminal, run the [duplicate scenario](../scenarios/duplicate.yaml)
against the fresh consumer on the default port.

```sh
node packages/cli/dist/index.js run --config examples/scenarios/duplicate.yaml --target http://127.0.0.1:3000
```

The scenario expects one credit across three successful deliveries of the
same event. The fixed consumer passes, with exit code 0. The buggy consumer
applies three credits and fails, with exit code 1. To try buggy mode, stop the
consumer, set `HOOKGUARD_DEMO_MODE=buggy` and restart it before repeating the
scenario.
