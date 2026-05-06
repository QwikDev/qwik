# Continuous Build Artifacts

This repo contains build artifacts that are generated as part of the continues build pipeline.

Currently supported artifacts:

- [`@qwik.dev/core`](https://github.com/QwikDev/qwik-build)
- [`@qwik.dev/router`](https://github.com/QwikDev/qwik-city-build)

The build artifact is created if:

- Code is merged to `main` branch
- Code is merged to `build/*` branch

## How to use

The build artifacts are useful if you want to:

- Install an un-released change.
- Bisect which specific commit caused a regression.

## Install specific build artifact

To install a specific build artifact change you `package.json` like so (not all lines may be needed):

```json
{
  "dependencies": {
    "@qwik.dev/core": "github:QwikDev/qwik-build#SHA",
    "@qwik.dev/router": "github:QwikDev/qwik-city-build#SHA"
  }
}
```

Where `#SHA` is one of the following:

- `#SHA` - Install a specific build SHA. You can get the SHA from:
  - [`@qwik.dev/core`](https://github.com/QwikDev/qwik-build/commits/) commits
  - [`@qwik.dev/router`](https://github.com/QwikDev/qwik-city-build/commits/) commits
- `#build/name` (or `#main`) - Install a specific `build/*` (or `#main`) branch:
  - [`@qwik.dev/core`](https://github.com/QwikDev/qwik-build/branches/) branches
  - [`@qwik.dev/router`](https://github.com/QwikDev/qwik-city-build/branches/) branches
    > NOTE: Package managers will treat any SHA in the lock file which is on the branch as valid, and so they will not auto upgrade to the latest. For this reason this is not recommended.

## Bisect for regression

You can bisect different commits to `main` to determine which specific change has cause the regression.

1. Install latest to get an upper mound
2. Install oldest known good to get a lower bound
3. Keep bisecting until you find a specific SHA where the code breaks.

When creating the issue please include which SHA has caused the regression.
