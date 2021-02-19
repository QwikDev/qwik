# DEVELOPER

## Setting up the environment

1. Install [bazelisk](https://github.com/bazelbuild/bazelisk).
2. `yarn` to install NPM dependencies.

# Running demos (`integration`)

```
bazel run integration:serve
```

Then open:

- http://localhost:8080/hello_world/

## Running Tests

All tests:

```
bazel test  ...
```

### Unit tests only

```
bazel test  --test_tag_filters=unit  ...
```

### E2e tests only

Before running the e2e tests, ensure that the `integration` server is running. (`bazel run integration:serve`)

```
bazel test  --test_tag_filters=e2e  ...
```

Running cypress manually

```
./node_modules/.bin/cypress open
```
