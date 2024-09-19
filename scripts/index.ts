/**
 * This is the root build scripts module (keep in commonjs). It's only a .js file but will handle
 * registering typescript files with esbuild-register to allow Node.js to build .ts files
 * on-demand.
 */
import { build } from './build';
import { loadConfig } from './util';

const args = process.argv.slice(2);

// load our build config, which figures out all the paths
// the rest of the build process uses.
const config = loadConfig(args);
config.esmNode = true;

// let's do this!
build(config);
