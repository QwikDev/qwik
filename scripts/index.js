/**
 * This is the root build scripts module (keep in commonjs). It's only a .js file
 * but will handling registering typescript files with esbuild-register
 * to allow NodeJS to build .ts files on-demand.
 */

const { register } = require('esbuild-register/dist/node');

const esmNode = parseInt(process.version.slice(1).split('.')[0], 10) >= 14;
register({ target: esmNode ? 'node16' : 'node10' });

const { build } = require('./build.ts');
const { loadConfig } = require('./util.ts');

const args = process.argv.slice(2);

// load our build config, which figures out all the paths
// the rest of the build process uses.
const config = loadConfig(args);
config.esmNode = esmNode;

// let's do this!
build(config);
