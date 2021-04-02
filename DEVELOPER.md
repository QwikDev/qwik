# DEVELOPER.md

## Publishing

```
bazel run client:qoot_pkg.publish -- --tag=next
```

## Apple M1

```
platform(
    name = "rosetta",
    constraint_values = [
        "@platforms//os:osx",
        "@platforms//cpu:x86_64",
    ],
)
```
