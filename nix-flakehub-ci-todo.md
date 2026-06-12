# Nix + FlakeHub CI TODO

## Current state

- Unix CI uses `nix develop` for tool prerequisites.
- FlakeHub Cache is optional and must not block CI when unavailable.
- Windows CI stays non-Nix and consumes the same GitHub artifacts as before.
- Build outputs are still cached with the existing GitHub Actions cache/artifact flow.

## Next steps

1. Package pnpm dependency materialization.
   - Create a Nix derivation keyed by `pnpm-lock.yaml`, package manifests, patches, and pnpm workspace config.
   - Store `node_modules/.pnpm` in a Nix store output.
   - Generate a manifest of top-level and workspace package links needed to reconstruct `node_modules`.
   - Add a cross-platform relink script that can rebuild the workspace `node_modules` layout from that store output.
   - Keep `pnpm install --frozen-lockfile` as the fallback path for non-Nix local development and Windows CI.

2. Package build outputs incrementally.
   - Start with `packages/optimizer` and `packages/qwik/dist`.
   - Add `packages/qwik-router/lib`, `packages/qwik-react/lib`, `packages/eslint-plugin-qwik/dist`, and `packages/create-qwik/dist`.
   - Use filtered Nix sources that mirror the current CI cache-key boundaries so unrelated source changes do not invalidate every package.
   - Copy or link Nix outputs back into the existing workspace paths so downstream tests and release jobs do not need to change immediately.

3. Replace branch-scoped cache skips carefully.
   - For each Nix-packaged output, prefer `nix build` substitution checks over `actions/cache` lookup-only keys.
   - Keep GitHub artifact upload/download for job fanout and Windows consumers.
   - Keep GitHub cache fallbacks until FlakeHub hit rates and failure behavior are known in real PR traffic.

4. Validate cache safety.
   - Only allow trusted upstream workflows to publish to FlakeHub Cache.
   - Ensure fork PRs run correctly without cache write access.
   - Confirm all Nix derivations are network-free after dependency materialization.
   - Keep `cache.nixos.org` and local build fallback enabled for all Nix commands.

5. Measure before removing old paths.
   - Track `pnpm install` time, Nix substitution time, package build time, and artifact transfer time.
   - Compare PRs with warm FlakeHub Cache, FlakeHub miss, and FlakeHub unavailable.
   - Remove old GitHub cache branches only when replacement paths are measurably stable.
