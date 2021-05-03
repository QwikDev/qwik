# DEVELOPER

# Setting up the environment

1. `npm` (or `yarn`) to install NPM dependencies.
2. Recomended: alias `bazel` and `ibazel`
   ```
   alias bazel=./node_modules/.bin/bazel
   alias ibazel=./node_modules/.bin/ibazel
   ```

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
bazel run client:qoot_pkg.publish -- --tag=next
```

## Pre-submit hooks

The project has pre-submit hooks which ensure that your code is correctly formated. You can run them manually like so:

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
