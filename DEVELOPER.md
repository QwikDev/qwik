# DEVELOPER

To build Qwik for local development, first [npm](https://docs.npmjs.com/) (or [yarn](https://yarnpkg.com/)) install the dev dependencies:

```
npm install
```

Next the `start` command will build the source files, begin the watch process so any
changes will rebuild, and run the unit test watch process.

```
npm start
```

## Running Dev Server Integration Tests

The `integration/` directory is for this local repo's integration and end-to-end testing, and not necessarily app demos. It's dev server is setup to always point to the local build and stay current with the watch process.

First start the integration dev server:

```
npm run integration.server
```

Then navigate to http://localhost:8080/

## Running Tests

To run both Unit tests ([Jest](https://jestjs.io/)) and E2E/Integration tests ([Cypress](https://www.cypress.io/)), run:

```
npm run tests
```

### Unit tests only (Jest)

```
npm run test.unit
```

> Note that the `npm start` command will also start Jest watch process.

### E2E tests only

To run the Cypress tests headless and from start to finish, run:

```
npm run test.e2e
```

To open and manually use Cypress manually, run:

```
npm run cypress
```

## Production Build

The `npm start` command will only run local development builds, watch unit tests, and watch the files for changes. For a full build ready for a production deployment, which includes minification and generating the correct `package.json` file, run:

```
npm run build
```

The build output will be written to `dist-dev/@builder.io-qwik`, which will be the directory that is published
to [@builder.io/qwik](https://www.npmjs.com/package/@builder.io/qwik). Note this build output directory is `git` ignored.

## Bazel

Bazel is currently used for further testing between internal repos. However, it is not required for local development and contribution to Qwik.

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

## Publishing

```
git fetch upstream
git checkout main
git reset --hard upstream/main
# edit src/package.json wtih new version number
VERSION=`node -e 'console.log(require("./src/package.json").version)'`
echo "About to publish v$VERSION"
bazel run src:pkg.publish -- --tag=latest --access=public
git commit -a -m "release: v$VERSION"
git tag v$VERSION
git push upstream main:main v$VERSION
```
