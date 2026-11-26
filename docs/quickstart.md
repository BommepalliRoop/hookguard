# Quickstart

From the repository checkout, use Node.js 24 and install the pinned pnpm version.
The same setup commands work on macOS, Linux, and Windows PowerShell.

```sh
npm install --global --ignore-scripts pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm build
```

Generate and validate the Express scenario.

```sh
node packages/cli/dist/index.js init
node packages/cli/dist/index.js validate --config hookguard-example/hookguard.yaml
```

`init` creates a new directory with the scenario and a synthetic payment fixture.
Pass a new directory name after `init --template express` to choose a different
location. If the directory already exists, the command exits with code 2 and
preserves its contents.

## See a duplicate-delivery failure

In a second terminal at the repository root, start the buggy Express consumer.
Use the command for your shell.

**macOS and Linux**

```sh
HOOKGUARD_DEMO_MODE=buggy pnpm --filter @hookguard/express-consumer start
```

**Windows PowerShell**

```powershell
$env:HOOKGUARD_DEMO_MODE = 'buggy'
pnpm --filter @hookguard/express-consumer start
```

In the first terminal, run the test.

```sh
node packages/cli/dist/index.js run --config hookguard-example/hookguard.yaml --target http://127.0.0.1:3000/webhook
```

The consumer returns HTTP 200 for each of the three deliveries. The state
assertion sees three credits and the CLI exits 1.

Stop the consumer with Ctrl+C and start a fresh process in fixed mode.

**macOS and Linux**

```sh
HOOKGUARD_DEMO_MODE=fixed pnpm --filter @hookguard/express-consumer start
```

**Windows PowerShell**

```powershell
$env:HOOKGUARD_DEMO_MODE = 'fixed'
pnpm --filter @hookguard/express-consumer start
```

Run the same test again. The consumer records one credit and the CLI exits 0.
Stop the consumer with Ctrl+C when finished.

The [scenario reference](scenario-reference.md) covers assertions, exit codes,
and JSON and JUnit reports.
