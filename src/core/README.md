# `src/core` folder contains the `Q-oot` framework

## Building Distribution

If you would like to build the distribution bundles then you can run these commands:

```
bazel build src/core/qwik             && ls -al dist/bin/src/core/qwik.js
bazel build src/core/qwik.min         && ls -al dist/bin/src/core/qwik.min.js
bazel build src/core/qwikloader       && ls -al dist/bin/src/core/qwikloader.js
bazel build src/core/qwikloader.min   && ls -al dist/bin/src/core/qwikloader.min.js
```
