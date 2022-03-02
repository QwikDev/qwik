# DEVELOPER

To build Qwik for local development, first [npm](https://docs.npmjs.com/) (or [yarn](https://yarnpkg.com/)) install the dev dependencies:

```
npm install
```

Next the `start` command will:

- Build the source files
- Begin the watch process so any changes will rebuild
- Run the type checking watch process with [tsc](https://www.typescriptlang.org/docs/handbook/compiler-options.html)
- Run the unit test (Jest) watch process

```
npm start
```

## Running All Tests

To run all Unit tests ([Jest](https://jestjs.io/)) and E2E tests [Playwright](https://playwright.dev/), run:

```
npm test
```

The `test` command will also ensure a build was completed.

### Unit Tests Only

Unit tests use [Jest](https://jestjs.io/).

```
npm run test.unit
```

To keep Jest open with the watch mode, run:

```
npm run test.watch
```

> Note that the `test.watch` command isn't necessary if you're running the `npm start` command, since `start` will also concurrently run the Jest watch process.

To debug and step through unit tests, within VSCode you can use the "Integration Dev Server" Debug launch task.

### E2E Tests Only

E2E tests use [Playwright](https://playwright.dev/).

To run the Playwright tests headless, from start to finish, run:

```
npm run test.e2e
```

## Production Build

The `npm start` command will run development builds, type check, watch unit tests, and watch the files for changes.

A full production build will:

- Builds each submodule
- Generates bundled `.d.ts` files for each submodule with [API Extractor](https://api-extractor.com/)
- Checks the public API hasn't changed
- Builds a minified `core.min.mjs` file
- Generates the publishing `package.json`

```
npm run build
```

The build output will be written to `dist-dev/@builder.io-qwik`, which will be the directory that is published
to [@builder.io/qwik](https://www.npmjs.com/package/@builder.io/qwik).

## Releasing `@builder.io/qwik`

1. Run `npm run release.prepare`, which will test, lint and build locally.
2. Use the interactive UI to select the next version, which will update the `package.json` `version` property, adds the git change, and starts a commit message.
3. Create a PR with the `package.json` file change to merge to `main`.
4. After the updated `package.json` with the next version is in `main`, click the [Run Workflow](https://github.com/BuilderIO/qwik/actions/workflows/ci.yml) button for the Qwik CI Github Action workflow.
5. Enter the NPM dist tag that should be used for this version, then click "Run Workflow".
6. The Github Action will dispatch the CI workflow to build each of the submodules, build WASM and native bindings, combine them into one package, and validate the package before publishing to NPM.
7. If the build is successful and all tests and validation passes, the CI workflow will automatically publish to NPM, commit a git tag to the repo, and create a Github release.
8. 🚀

## Starter CLI `create-qwik`

- [Starter CLI](https://github.com/BuilderIO/qwik/blob/main/starters/README.md)

## Bazel

Bazel is currently used for further testing and builds between internal repos. However, it is not required for local development and contribution to Qwik.

### Setting up the Bazel environment

Best way to run `bazel` is with [`bazelisk`](https://github.com/bazelbuild/bazelisk) which will automatically download and execute the right version of `bazel`.

_preferred way_

```
brew install bazelisk
```

or

```
npm install -g @bazel/bazelisk
```

`Bazel` will invoke `Yarn` and manage all dependencies.

### `bazel` vs `ibazel`

The difference between `bazel` and `ibazel` is that `ibazel` will re-invoke `bazel` if any relevant files change. This is useful for constantly updating the server and or tests as they are being developed. All commands are listed as `bazel`, but can be replaced for `ibazel` as needed.

## Pre-submit hooks

The project has pre-submit hooks, which ensure that your code is correctly formatted. You can run them manually like so:

```
npm run lint
npm run buildifier-check
npm run prettier-check
```

Some of the issues can be fixed automatically by using:

```
npm run buildifier-fix
npm run prettier-fix
```
