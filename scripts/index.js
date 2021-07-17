const { register } = require('esbuild-register/dist/node');
const { dirname, join } = require('path');

register({ target: 'node15' });

const { build } = require('./build.ts');
const { loadConfig } = require('./util.ts');

const args = process.argv.slice(2);

const config = loadConfig(args);

if (process.env.BAZEL_NODE_MODULES_ROOTS) {
  config.pkgDir = dirname(join(process.cwd(), args[0]));
  config.dev = true;
}

build(config);
