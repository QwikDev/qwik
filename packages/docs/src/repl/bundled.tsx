import { version as qwikVersion } from '../../../qwik';
import type { PkgUrls } from './types';

import prettierPkgJson from 'prettier/package.json';
import prettierParserHtml from 'prettier/plugins/html.js?raw';
import prettierStandaloneJs from 'prettier/standalone.js?raw';
import terserPkgJson from 'terser/package.json';
import terserJs from '../../node_modules/terser/dist/bundle.min.js?raw';
import qBuild from '../../node_modules/@builder.io/qwik/dist/build/index.d.ts?raw';
import qCoreCjs from '../../node_modules/@builder.io/qwik/dist/core.cjs?raw';
import qCoreDts from '../../node_modules/@builder.io/qwik/dist/core.d.ts?raw';
import qCoreMinMjs from '../../node_modules/@builder.io/qwik/dist/core.min.mjs?raw';
import qCoreMjs from '../../node_modules/@builder.io/qwik/dist/core.mjs?raw';
import qJsxDts from '../../node_modules/@builder.io/qwik/dist/jsx-runtime.d.ts?raw';
import qOptimizerCjs from '../../node_modules/@builder.io/qwik/dist/optimizer.cjs?raw';
import qServerCjs from '../../node_modules/@builder.io/qwik/dist/server.cjs?raw';
import qServerDts from '../../node_modules/@builder.io/qwik/dist/server.d.ts?raw';
import { isServer } from '@builder.io/qwik/build';

export const QWIK_PKG_NAME = '@builder.io/qwik';
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
      pkgVersion = '';
    }
  }
  return `https://cdn.jsdelivr.net/npm/${pkgName}${pkgVersion ? '@' + pkgVersion : ''}${pkgPath}`;
};

// https://github.com/vitejs/vite/issues/15753
const blobUrl = (code: string) => {
  if (isServer) {
    return '';
  }
  const blob = new Blob([code], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
};

const bundled: PkgUrls = {
  [QWIK_PKG_NAME]: {
    version: qwikVersion,
    '/build/index.d.ts': blobUrl(qBuild),
    '/core.cjs': blobUrl(qCoreCjs),
    '/core.d.ts': blobUrl(qCoreDts),
    '/core.min.mjs': blobUrl(qCoreMinMjs),
    '/core.mjs': blobUrl(qCoreMjs),
    '/jsx-runtime.d.ts': blobUrl(qJsxDts),
    '/optimizer.cjs': blobUrl(qOptimizerCjs),
    '/server.cjs': blobUrl(qServerCjs),
    '/server.d.ts': blobUrl(qServerDts),
  },
  prettier: {
    version: prettierPkgJson.version,
    '/plugins/html.js': blobUrl(prettierParserHtml),
    '/standalone.js': blobUrl(prettierStandaloneJs),
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
    '/dist/bundle.min.js': blobUrl(terserJs),
  },
};

export const getBundled = () =>
  isServer
    ? {
        [QWIK_PKG_NAME]: { version: qwikVersion },
      }
    : bundled;
