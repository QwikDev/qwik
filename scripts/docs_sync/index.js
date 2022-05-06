/**
 * This is the root build scripts module (keep in commonjs). It's only a .js file
 * but will handling registering typescript files with esbuild-register
 * to allow NodeJS to build .ts files on-demand.
 */

const { join } = require('path');
const { register } = require('esbuild-register/dist/node');

const esmNode = parseInt(process.version.slice(1).split('.')[0], 10) >= 14;
register({ target: esmNode ? 'node14' : 'node10' });

const { main } = require('./main.ts');
main(join(process.cwd(), 'packages'));
