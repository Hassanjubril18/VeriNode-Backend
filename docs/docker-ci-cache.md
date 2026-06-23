# Docker CI Layer Cache

The CI Docker build uses BuildKit and GitHub Actions cache storage to reuse the expensive dependency and build layers between pull requests, pushes, and weekly warmups.

## Layer Strategy

- `base` pins `node:22-bookworm-slim` by digest so CI does not silently pull a different base image during ordinary builds.
- `deps` copies only `package.json` and `package-lock.json` before `npm ci`, keeping dependency installation cached when source files change.
- `build` copies TypeScript sources after dependencies and runs `npm run build`.
- `runtime-deps` installs production-only dependencies in its own cacheable layer.
- `runtime` copies only `node_modules`, `dist`, `index.js`, and package metadata into the final image.

The workflow stores BuildKit layers with `type=gha` under a single `verinode-backend-node22` scope. Keeping one active scope and a tight `.dockerignore` keeps the registry/cache footprint bounded for the 5GB target.

## Warmup Cadence

`.github/workflows/docker-image.yml` runs on pull requests, pushes to `main`, manual dispatch, and every Monday at 03:17 UTC. The scheduled run warms the pinned base and dependency layers.

`.github/dependabot.yml` checks Docker and GitHub Actions updates weekly. When Dependabot opens a Docker digest update for `NODE_IMAGE`, merging it refreshes the pinned base image for security patches without allowing ordinary CI runs to float to an unreviewed base layer.

## Benchmark Commands

Use these commands to compare cold and warm local BuildKit behavior:

```bash
docker buildx create --use --name verinode-cache-bench
docker buildx build --no-cache --target runtime --progress=plain -t verinode-backend:cold .
docker buildx build --target runtime --progress=plain -t verinode-backend:warm .
```

Expected CI targets from issue #75:

- Cache restore: under 30 seconds.
- Cache-hit build: under 3 minutes.
- Cache-miss build: under 8 minutes.

GitHub Actions cache-hit timing is visible in the `Docker Image Cache` workflow logs after the first successful run populates the `verinode-backend-node22` cache scope.
