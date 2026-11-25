# Releasing

1. Bump `version` in `packages/app/package.json`, then commit and push.
2. Tag the commit and push the tag:

   ```bash
   git tag v0.0.3 && git push origin v0.0.3
   ```

3. Wait for the [release workflow](https://github.com/lawsonoates/doket/actions/workflows/release.yml) to pass. It uploads the binaries to a GitHub release, which `doket.dev/install` serves straight away, and stages five packages on npm.
4. Approve the staged packages with 2FA, which needs npm 12 or later. Wait until `npm stage list` shows all five as `staged`, then approve the four `doket-<os>-<arch>` packages before `@lawsonoates/doket`, which depends on them:

   ```bash
   npm stage list
   npm stage approve <stage-id>
   ```

5. Check the release:

   ```bash
   npx @lawsonoates/doket@latest --version
   ```

   An install can fail for about five minutes after approval while npm's CDN still serves a cached "not found".

## How it works

- `bun run build` in `packages/app` compiles a standalone binary for linux and darwin on x64 and arm64 into `dist/`. `--single` builds only the current platform.
- `bun run publish:npm` publishes each binary as `doket-<os>-<arch>`, then `@lawsonoates/doket`, which installs the matching one through `optionalDependencies` and runs it from `npm/doket.js`. Versions npm already has are skipped, so the script can be rerun. `--stage` stages them instead of publishing.
- The workflow stages through npm trusted publishing, with no token. Each of the five packages names this repository and `release.yml` as its trusted publisher on npmjs.com, with `npm publish` left disallowed, so nothing goes live without your approval. A 404 or "not authorized" when staging means a package's trusted publisher settings don't match.
- The workflow fails early if the tag doesn't match the version in `packages/app/package.json`.
