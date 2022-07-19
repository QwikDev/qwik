// import { dirname, join } from "path";
// import { fileURLToPath } from "url";

// let path = join(dirname(fileURLToPath(import.meta.url)), 'packages', 'qwik', 'src', 'core', 'index.ts');
// console.log(path);

const corePath = '/Users/manualmeida/repos/builderio/qwik/packages/qwik/src/core/index.ts';
let mappingModules = {
  name: 'mapping',
  setup(build) {
    build.onResolve({ filter: /^@builder\.io\/qwik$/ }, (args) => {
      return { path: corePath };
    });
  },
};

let config = {
  '.tsx': {
    jsxFactory: 'qwikJsx.h',
    jsxFragment: 'qwikJsx.Fragment',
    banner: `
    globalThis.describe = true;
    import * as qwikJsx from "/Users/manualmeida/repos/builderio/qwik/packages/qwik/src/core/index.ts";`,
    target: 'es2020',
    loader: 'tsx',
    minify: false,
  },
  '.ts': {
    loader: 'ts',
    banner: 'globalThis.describe = true;',
    minify: false,
  },
};

/**
 * PICK ONE
 */

// ESM - default
export default config;
