workspace(
    name = "qoot",
    managed_directories = {"@npm": ["node_modules"]},
)

load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")

# Fetch rules_nodejs so we can install our npm dependencies
http_archive(
    name = "build_bazel_rules_nodejs",
    sha256 = "dd7ea7efda7655c218ca707f55c3e1b9c68055a70c31a98f264b3445bc8f4cb1",
    urls = ["https://github.com/bazelbuild/rules_nodejs/releases/download/3.2.3/rules_nodejs-3.2.3.tar.gz"],
)

# Check the rules_nodejs version and download npm dependencies
# Note: bazel (version 2 and after) will check the .bazelversion file so we don't need to
# assert on that.
load("@build_bazel_rules_nodejs//:index.bzl", "check_rules_nodejs_version", "node_repositories", "yarn_install")

check_rules_nodejs_version(minimum_version_string = "2.2.0")

# Setup the Node.js toolchain
node_repositories(
    node_version = "13.7.0",
    package_json = ["//:package.json"],
)

yarn_install(
    name = "npm",
    package_json = "//:package.json",
    yarn_lock = "//:yarn.lock",
)

load("@npm//@bazel/cypress:index.bzl", "cypress_repository")

# The name you pass here names the external repository you can load cypress_web_test from
cypress_repository(name = "cypress")

# TODO: https://github.com/bazelbuild/buildtools/tree/master/buildifier