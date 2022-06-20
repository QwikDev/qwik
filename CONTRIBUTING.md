# CONTRIBUTING

To build Qwik for local development, first install the dev dependencies using [yarn](https://yarnpkg.com/)):

```
yarn
```

Next the `start` command will:

- Build the source files
- Begin the watch process so any changes will rebuild
- Run the type checking watch process with [tsc](https://www.typescriptlang.org/docs/handbook/compiler-options.html)
- Run the unit test (Jest) watch process

```
yarn start
```

## Running All Tests

To run all Unit tests ([Jest](https://jestjs.io/)) and E2E tests [Playwright](https://playwright.dev/), run:

```
yarn test
```

The `test` command will also ensure a build was completed.

### Unit Tests Only

Unit tests use [Jest](https://jestjs.io/).

```
yarn test.unit
```

To keep Jest open with the watch mode, run:

```
yarn test.watch
```

> Note that the `test.watch` command isn't necessary if you're running the `npm start` command, since `start` will also concurrently run the Jest watch process.

### E2E Tests Only

E2E tests use [Playwright](https://playwright.dev/).

To run the Playwright tests headless, from start to finish, run:

```
yarn test.e2e
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
yarn build
```

The build output will be written to `packages/qwik/dist`, which will be the directory that is published
to [@builder.io/qwik](https://www.npmjs.com/package/@builder.io/qwik).

## Releasing `@builder.io/qwik`

1. Run `yarn release.prepare`, which will test, lint and build.
2. Use the interactive UI to select the next version, which will update the `package.json` `version` property, add the git change, and start a commit message.
3. Create a PR with the `package.json` change to merge to `main`.
4. After the `package.json` with the updated version is in `main`, click the [Run Workflow](https://github.com/BuilderIO/qwik/actions/workflows/ci.yml) button from the "Qwik CI" Github Action workflow.
5. Select the NPM dist-tag that should be used for this version, then click "Run Workflow".
6. The Github Action will dispatch the workflow to build `@builder.io/qwik` and each of the submodules, build WASM and native bindings, combine them into one package, and validate the package before publishing to NPM.
7. If the build is successful and all tests and validation passes, the workflow will automatically publish to NPM, commit a git tag to the repo, and create a Github release.
8. 🚀

## Releasing `@builder.io/qwik-city`

1. Run `yarn release.prepare.qwik-city`, which will test and build.
2. Use the interactive UI to select the next version, which will update the `package.json` `version` property, add the git change, and start a commit message.
3. Create a PR with the `package.json` change to merge to `main`.
4. After the `package.json` with the updated version is in `main`, click the [Run Workflow](https://github.com/BuilderIO/qwik/actions/workflows/release-qwik-city.yml) button from the "Release Qwik City" Github Action workflow.
5. The Github Action will dispatch the workflow to build and publish `@builder.io/qwik-city`.
6. If the build is successful and all tests and validation passes, the workflow will automatically publish to NPM.
7. ⚡️

## Starter CLI `create-qwik`

- [Starter CLI](https://github.com/BuilderIO/qwik/blob/main/starters/README.md)

## Pre-submit hooks

The project has pre-submit hooks, which ensure that your code is correctly formatted. You can run them manually like so:

```
yarn lint
yarn buildifier-check
yarn prettier-check
```

Some of the issues can be fixed automatically by using:

```
yarn buildifier-fix
yarn prettier-fix
```
