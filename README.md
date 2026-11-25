# doket

Install on Linux or macOS (x64 or arm64):

```bash
curl -fsSL https://doket.dev/install | bash
# or
npm install -g @lawsonoates/doket
```

## Development

```bash
bun install
bun run check
bun run typecheck
bun run test
```

To put the `doket` command on your PATH:

```bash
cd packages/app
bun link
bun link --global @doket/app
```

## Releasing

`bun run build` in `packages/app` compiles a standalone binary for each of linux and darwin on x64 and arm64 into `dist/` (`--single` builds only the current platform). To release, bump `version` in `packages/app/package.json`, commit, then push a matching tag:

```bash
git tag v0.0.2 && git push origin v0.0.2
```

The `release` workflow checks and tests the repo, uploads the binaries to a GitHub release (which `doket.dev/install` downloads), then publishes `doket-<os>-<arch>` and `@lawsonoates/doket`, which installs the right one to npm. It publishes through npm trusted publishing, so each of those five packages names this repository and `release.yml` as a trusted publisher on npmjs.com.
