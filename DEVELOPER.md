# DEVELOPER

## Setting up the environment

1. Install [bazelisk](https://github.com/bazelbuild/bazelisk).
2. `yarn` to install NPM dependencies.

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
bazel run client:qoot_pkg.publish -- --tag=next
```

## Buildifier

To ensure that all `BUILD.bazel` files are correctly formatted run:

```
yarn buildifier
```
