/**
 * This is the root build scripts module (keep in commonjs). It's only a .js file
 * but will handling registering typescript files with esbuild-register
 * to allow NodeJS to build .ts files on-demand.
 */

const { dirname, join } = require('path');
const { register } = require('esbuild-register/dist/node');

// allows NodeJS to compile TypeScript files
register({ target: 'node15' });

const { build } = require('./build.ts');
const { loadConfig } = require('./util.ts');

const args = process.argv.slice(2);

// load our build config, which figures out all the paths
// the rest of the build process uses.
const config = loadConfig(args);

if (process.env.BAZEL_NODE_MODULES_ROOTS) {
  // This is a signal that Bazel has started this script
  // If Bazel is running this, then find out where it
  // would like to see the build output to be written.
  config.pkgDir = dirname(join(process.cwd(), args[0]));
  config.dev = true;
}

// let's do this!
build(config);
