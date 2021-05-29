# `Client` folder contains the `Q-oot` framework

## Building Distribution

If you would like to build the distribution bundles then you can run these commands:

```
bazel build client/qwik             && ls -al dist/bin/client/qwik.js
bazel build client/qwik.min         && ls -al dist/bin/client/qwik.min.js
bazel build client/qwikloader       && ls -al dist/bin/client/qwikloader.js
bazel build client/qwikloader.min   && ls -al dist/bin/client/qwikloader.min.js
```
