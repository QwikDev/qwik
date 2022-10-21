const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const corePath = pathToFileURL(join(__dirname, 'packages', 'qwik', 'src', 'core', 'index.ts'));

module.exports = {
  common: {
    minifyWhitespace: true,
    target: 'es2020',
  },
  config: {
    '.tsx': {
      jsxFactory: 'qwikJsx.h',
      jsxFragment: 'qwikJsx.Fragment',
      banner: `
      globalThis.qTest = true;
      globalThis.qRuntimeQrl = true;
      globalThis.qDev = true;
      import * as qwikJsx from "${corePath}";`,
      target: 'es2020',
      loader: 'tsx',
      minify: false,
    },
    '.ts': {
      loader: 'ts',
      banner: `
globalThis.qTest = true;
globalThis.qRuntimeQrl = true;
globalThis.qDev = true;
`,
      minify: false,
    },
  },
};
