# DEVELOPER

# Setting up the environment

## Setting up the environment

> NOTE: This repo is currently in the transition to the `bazel` build system. Only `bazel` developer information is documented here.

The repo uses `bazel` for building. Best way to run `bazel` is with [`bazelisk`](https://github.com/bazelbuild/bazelisk) which will automatically download and execute the right version of `bazel`.

_preferred way_

```
brew install bazelisk
```

or

```
npm install -g @bazel/bazelisk
```

`Bazel` will invoke `Yarn` and manage all dependencies.

## `bazel` vs `ibazel`

The difference between `bazel` and `ibazel` is that `ibazel` will re-invoke `bazel` if any relevant files change. This is useful for constantly updating the server and or tests as they are being developed. All commands are listed as `bazel`, but can be replaced for `ibazel` as needed.

# Running demos (`integration`)

```
bazel run integration:server
```

Then open:

- http://localhost:8080/

## Running Tests

All tests:

```
bazel test  //...
```

### Unit tests only

```
bazel test  --test_tag_filters=unit  //...
```

### E2e tests only

Before running the e2e tests, ensure that the `integration` server is running. (`bazel run integration:server`)

```
bazel test  --test_tag_filters=e2e  //...
```

Running cypress manually

```
./node_modules/.bin/cypress open
```

## Publishing

```
bazel run client:qwik_pkg.publish -- --tag=next
```

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
