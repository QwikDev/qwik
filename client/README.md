# `Client` folder contains the `Q-oot` framework

## Building Distribution

If you would like to build the distribution bundles then you can run these commands:

```
bazel build client/qoot             && ls -al dist/bin/client/qoot.js
bazel build client/qoot.min         && ls -al dist/bin/client/qoot.min.js
bazel build client/qootloader       && ls -al dist/bin/client/qootloader.js
bazel build client/qootloader.min   && ls -al dist/bin/client/qootloader.min.js
```
