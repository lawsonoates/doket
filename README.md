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

See [RELEASING.md](RELEASING.md).
