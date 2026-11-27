# Release preparation

HookGuard uses semantic versioning. Alpha candidates use `MAJOR.MINOR.PATCH-alpha.N` and the `alpha` npm distribution tag. The first candidate version is `0.1.0-alpha.1`. Increase the alpha sequence for subsequent candidates at the same planned version. A stable release uses `MAJOR.MINOR.PATCH`. After 1.0.0, bump the major for an incompatible public contract change, the minor for compatible features, and the patch for compatible fixes. Document compatibility changes in the [changelog](../CHANGELOG.md).

## Build a local candidate

Use the workspace's supported Node.js and pinned pnpm versions.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm run package:cli
```

The default tarball is `dist/release/hookguard-cli-0.1.0-alpha.1.tgz`. Supply another alpha version as an argument to `pnpm run package:cli`. The script stages compiled JavaScript, pinned runtime dependencies in the manifest, the license, dependency notices, and the package README. The workspace and staged CLI package are private. The candidate can be installed locally with `npm install --ignore-scripts /absolute/path/to/hookguard-cli-0.1.0-alpha.1.tgz`.

Build twice from the same checkout and frozen dependencies. Compare the tarballs byte for byte and record their SHA-256 digest. Install into an empty directory outside the repository, check `hookguard --version`, and run the quickstart against the installed CLI.

## Publishing gates

The proposed npm name is `@hookguard/cli`. A missing package in the public registry does not establish rights to its scope. The owner must verify the scope, publishing identity, and release credentials, review the [third-party notices](../THIRD_PARTY_NOTICES.md), and approve publishing. Any authorized workflow needs an explicitly configured publishing identity and minimum required permissions. Attach the artifact checksum and acceptance-test evidence to the release notes. Stable release also requires evidence of user validation.
