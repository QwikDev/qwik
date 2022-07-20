const { join } = require('path');

const corePath = join(__dirname, 'packages', 'qwik', 'src', 'core', 'index.ts');

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
      globalThis.describe = true;
      import * as qwikJsx from "${corePath}";`,
      target: 'es2020',
      loader: 'tsx',
      minify: false,
    },
    '.ts': {
      loader: 'ts',
      banner: 'globalThis.describe = true;',
      minify: false,
    },
  },
};
