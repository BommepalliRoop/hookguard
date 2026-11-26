# Third-party notices

The HookGuard CLI distribution installs these direct npm dependencies. The package tarball includes the complete upstream license text for each dependency in `THIRD_PARTY_NOTICES.txt`. These versions declare no additional runtime dependencies.

| Package | Version | License | Copyright in upstream license |
| --- | --- | --- | --- |
| `commander` | 14.0.3 | MIT | 2011 TJ Holowaychuk |
| `yaml` | 2.9.1 | ISC | Eemeli Aro |
| `zod` | 4.6.7 | MIT | 2025 Colin McDonnell |

Express is an MIT-licensed dependency of the local example. Workspace development tools retain the licenses supplied by their npm packages. The license inventory also includes Apache-2.0, BlueOak-1.0.0, BSD-2-Clause, BSD-3-Clause, ISC, and MPL-2.0 licenses. In particular, Lightning CSS and its platform binding use MPL-2.0 and are development dependencies excluded from the CLI tarball.

Run the following checks after dependency changes.

```sh
pnpm install --frozen-lockfile
pnpm licenses list --json
pnpm audit --json
```

On 2026-11-26 the frozen workspace installation completed and the registry audit returned zero advisories. The license inventory describes the installed dependency graph for the current host. Review inventory changes and any newly redistributed code before release.
