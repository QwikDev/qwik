# `src/core` folder contains the `Qwik` framework

## Building Distribution

If you would like to build the distribution bundles then you can run these commands:

```
bazel build src:core.js          && ls -al dist/bin/src/core.js
bazel build src:qwikloader       && ls -al dist/bin/src/qwikloader.js
bazel build src:qwikloader.min   && ls -al dist/bin/src/qwikloader.min.js
```
