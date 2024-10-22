import { version as qwikVersion } from '@qwik.dev/core';
import type { PkgUrls } from './types';

import prettierPkgJson from 'prettier/package.json';
import prettierParserHtml from '../../node_modules/prettier/plugins/html.js?raw-source';
import prettierStandaloneJs from '../../node_modules/prettier/standalone.js?raw-source';

import terserPkgJson from 'terser/package.json';
import terserJs from '../../node_modules/terser/dist/bundle.min.js?raw-source';

import qWasmCjs from '../../node_modules/@qwik.dev/core/bindings/qwik.wasm.cjs?raw-source';
import qWasmBinUrl from '../../node_modules/@qwik.dev/core/bindings/qwik_wasm_bg.wasm?raw-source';
import qBuild from '../../node_modules/@qwik.dev/core/dist/build/index.d.ts?raw-source';
import qCoreCjs from '../../node_modules/@qwik.dev/core/dist/core.qwik.cjs?raw-source';
import qCoreDts from '../../node_modules/@qwik.dev/core/dist/core.d.ts?raw-source';
import qCoreMinMjs from '../../node_modules/@qwik.dev/core/dist/core.min.qwik.mjs?raw-source';
import qCoreMjs from '../../node_modules/@qwik.dev/core/dist/core.qwik.mjs?raw-source';
import qOptimizerCjs from '../../node_modules/@qwik.dev/core/dist/optimizer.cjs?raw-source';
import qServerCjs from '../../node_modules/@qwik.dev/core/dist/server.cjs?raw-source';
import qServerDts from '../../node_modules/@qwik.dev/core/dist/server.d.ts?raw-source';

export const QWIK_PKG_NAME = '@qwik.dev/core';
const ROLLUP_VERSION = '2.75.6';

export const getNpmCdnUrl = (
  bundled: PkgUrls,
  pkgName: string,
  pkgVersion: string,
  pkgPath: string
) => {
  if (pkgVersion === 'bundled') {
    const files = bundled[pkgName];
    if (files) {
      pkgVersion = files.version;
      const url = files[pkgPath];
      if (url) {
        return url;
      }
    } else {
      // fall back to latest
      pkgVersion = pkgName === QWIK_PKG_NAME ? qwikVersion.split('-dev')[0] : '';
    }
  }
  return `https://cdn.jsdelivr.net/npm/${pkgName}${pkgVersion ? '@' + pkgVersion : ''}${pkgPath}`;
};

export const bundled: PkgUrls = {
  [QWIK_PKG_NAME]: {
    version: qwikVersion,
    '/dist/build/index.d.ts': qBuild,
    '/dist/core.qwik.cjs': qCoreCjs,
    '/dist/core.d.ts': qCoreDts,
    '/dist/core.min.qwik.mjs': qCoreMinMjs,
    '/dist/core.qwik.mjs': qCoreMjs,
    '/dist/optimizer.cjs': qOptimizerCjs,
    '/dist/server.cjs': qServerCjs,
    '/dist/server.d.ts': qServerDts,
    '/bindings/qwik.wasm.cjs': qWasmCjs,
    '/bindings/qwik_wasm_bg.wasm': qWasmBinUrl,
  },
  prettier: {
    version: prettierPkgJson.version,
    '/plugins/html.js': prettierParserHtml,
    '/standalone.js': prettierStandaloneJs,
  },
  // v4 of rollup uses wasm etc, need to figure out how to bundle that
  rollup: {
    version: ROLLUP_VERSION,
    '/dist/rollup.browser.js': getNpmCdnUrl(
      {},
      'rollup',
      ROLLUP_VERSION,
      '/dist/rollup.browser.js'
    ),
  },
  terser: {
    version: terserPkgJson.version,
    '/dist/bundle.min.js': terserJs,
  },
};
