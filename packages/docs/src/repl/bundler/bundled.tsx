import { version as qwikVersion } from '@builder.io/qwik';
import type { PkgUrls } from '../types';

import qBuild from '../../../node_modules/@builder.io/qwik/dist/build/index.d.ts?raw-source';
import qCoreDts from '../../../node_modules/@builder.io/qwik/dist/core.d.ts?raw-source';
import qCoreMinMjs from '../../../node_modules/@builder.io/qwik/dist/core.min.mjs?raw-source';
import qCoreMjs from '../../../node_modules/@builder.io/qwik/dist/core.mjs?raw-source';
import qOptimizerMjs from '../../../node_modules/@builder.io/qwik/dist/optimizer.mjs?raw-source';
import qPreloaderMjs from '../../../node_modules/@builder.io/qwik/dist/preloader.mjs?raw-source';
// we use the debug version for the repl so it's understandable
import qQwikLoaderJs from '../../../node_modules/@builder.io/qwik/dist/qwikloader.debug.js?raw-source';
import qServerMjs from '../../../node_modules/@builder.io/qwik/dist/server.mjs?raw-source';
import qServerDts from '../../../node_modules/@builder.io/qwik/dist/server.d.ts?raw-source';
import qWasmMjs from '../../../node_modules/@builder.io/qwik/bindings/qwik.wasm.mjs?raw-source';
import qWasmBinUrl from '../../../node_modules/@builder.io/qwik/bindings/qwik_wasm_bg.wasm?raw-source';

import { QWIK_PKG_NAME } from '../repl-constants';

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
    // For bundled version, use local files
    '/dist/build/index.d.ts': qBuild,
    '/dist/core.d.ts': qCoreDts,
    '/dist/core.min.mjs': qCoreMinMjs,
    '/dist/core.mjs': qCoreMjs,
    '/dist/optimizer.mjs': qOptimizerMjs,
    '/dist/server.mjs': qServerMjs,
    '/dist/server.d.ts': qServerDts,
    '/dist/preloader.mjs': qPreloaderMjs,
    '/dist/qwikloader.js': qQwikLoaderJs,
    '/bindings/qwik.wasm.mjs': qWasmMjs,
    '/bindings/qwik_wasm_bg.wasm': qWasmBinUrl,
  },
};

export const getDeps = (qwikVersion: string) => {
  const out = { ...bundled };
  if (qwikVersion !== 'bundled') {
    const [M, m, p] = qwikVersion.split('-')[0].split('.').map(Number);
    const prefix = M > 1 || (M == 1 && (m > 7 || (m == 7 && p >= 2))) ? '/dist/' : '/';
    out[QWIK_PKG_NAME] = {
      version: qwikVersion,
    };
    for (const p of [
      `/dist/core.mjs`,
      `/dist/core.min.mjs`,
      `/dist/optimizer.mjs`,
      `/dist/server.mjs`,
      `/bindings/qwik.wasm.mjs`,
      `/bindings/qwik_wasm_bg.wasm`,
      `/dist/qwikloader.js`,
      `/dist/preloader.mjs`,
    ]) {
      out[QWIK_PKG_NAME][p] = getNpmCdnUrl(
        bundled,
        QWIK_PKG_NAME,
        qwikVersion,
        p.replace('/dist/', prefix)
      );
    }
  }
  return out;
};
