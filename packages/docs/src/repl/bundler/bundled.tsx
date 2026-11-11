import { version as qwikVersion } from '@qwik.dev/core';
import type { PkgUrls } from '../types';

import qBuild from '../../../node_modules/@qwik.dev/core/dist/build/index.d.ts?raw-source';
import qCoreDts from '../../../node_modules/@qwik.dev/core/dist/core-internal.d.ts?raw-source';
import qCoreQrlMjs from '../../../node_modules/@qwik.dev/core/dist/core-qrl.mjs?raw-source';
import qCoreQwikMjs from '../../../node_modules/@qwik.dev/core/dist/core.qwik.mjs?raw-source';
import qAsyncLocalStorageMjs from '../../../node_modules/@qwik.dev/core/dist/async-local-storage.mjs?raw-source';
import qViteMjs from '../../../node_modules/@qwik.dev/core/dist/optimizer.mjs?raw-source';
import qPreloaderMjs from '../../../node_modules/@qwik.dev/core/dist/preloader.mjs?raw-source';
import qWorkerMjs from '../../../node_modules/@qwik.dev/core/dist/worker/index.mjs?raw-source';
import qWorkerJs from '../../../node_modules/@qwik.dev/core/dist/worker/worker.js?raw-source';
import qWorkerNodeJs from '../../../node_modules/@qwik.dev/core/dist/worker/worker.node.js?raw-source';
import qWorkerSharedJs from '../../../node_modules/@qwik.dev/core/dist/worker/worker.shared.js?raw-source';
// we use the debug version for the repl so it's understandable
import qQwikLoaderJs from '../../../node_modules/@qwik.dev/core/dist/qwikloader.debug.js?raw-source';
import qSerializerMjs from '../../../node_modules/@qwik.dev/core/dist/serializer.mjs?raw-source';
import qServerMjs from '../../../node_modules/@qwik.dev/core/dist/server.mjs?raw-source';
import qServerDts from '../../../node_modules/@qwik.dev/core/dist/server.d.ts?raw-source';
import qTsOptimizerMjs from '../../../node_modules/@qwik.dev/core/dist/ts-optimizer.mjs?raw-source';

import { QWIK_PKG_NAME_V1, QWIK_PKG_NAME_V2 } from '../repl-constants';
import { shipsCoreAsQwikLibrary } from './core-layout';

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
      pkgVersion =
        pkgName === QWIK_PKG_NAME_V1 || pkgName === QWIK_PKG_NAME_V2
          ? qwikVersion.split('-dev')[0]
          : '';
    }
  }
  if (pkgName === '@qwik.dev/optimizer') {
    let compat = false;
    if (pkgVersion < '2') {
      pkgName = '@builder.io/qwik';
      compat = true;
    } else if (pkgVersion.startsWith('2.0.0-') && Number(pkgVersion.split('.').slice(-1)[0]) < 30) {
      pkgName = '@qwik.dev/core';
      compat = true;
    }
    if (compat) {
      pkgPath = pkgPath.replace('/index.mjs', '/optimizer.mjs');
    }
  }
  return `https://cdn.jsdelivr.net/npm/${pkgName}${pkgVersion ? '@' + pkgVersion : ''}${pkgPath}`;
};

const qwikUrls: PkgUrls[string] = {
  version: qwikVersion,
  // For bundled version, use local files
  '/dist/build/index.d.ts': qBuild,
  '/dist/core.d.ts': qCoreDts,
  '/dist/core.qwik.mjs': qCoreQwikMjs,
  '/dist/core-qrl.mjs': qCoreQrlMjs,
  '/dist/async-local-storage.mjs': qAsyncLocalStorageMjs,
  '/dist/optimizer.mjs': qViteMjs,
  '/dist/server.mjs': qServerMjs,
  '/dist/serializer.mjs': qSerializerMjs,
  '/dist/server.d.ts': qServerDts,
  '/dist/preloader.mjs': qPreloaderMjs,
  '/dist/worker/index.mjs': qWorkerMjs,
  '/dist/worker/worker.js': qWorkerJs,
  '/dist/worker/worker.node.js': qWorkerNodeJs,
  '/dist/worker/worker.shared.js': qWorkerSharedJs,
  '/dist/qwikloader.js': qQwikLoaderJs,
  '/dist/ts-optimizer.mjs': qTsOptimizerMjs,
};
export const bundled: PkgUrls = {
  [QWIK_PKG_NAME_V1]: qwikUrls,
  [QWIK_PKG_NAME_V2]: qwikUrls,
};

export const getDeps = (qwikVersion: string) => {
  const out = { ...bundled };
  if (qwikVersion !== 'bundled') {
    const [M, m, p] = qwikVersion.split('-')[0].split('.').map(Number);
    const prefix = M > 1 || (M == 1 && (m > 7 || (m == 7 && p >= 2))) ? '/dist/' : '/';
    const isV2 = qwikVersion >= '2';
    const pkgName = isV2 ? QWIK_PKG_NAME_V2 : QWIK_PKG_NAME_V1;
    out[QWIK_PKG_NAME_V1] = {
      version: qwikVersion,
    };
    const coreFiles = shipsCoreAsQwikLibrary(qwikVersion)
      ? ['/dist/core.qwik.mjs', '/dist/core-qrl.mjs']
      : ['/dist/core.mjs', '/dist/core.min.mjs', '/handlers.mjs'];
    for (const p of [
      ...coreFiles,
      `/dist/async-local-storage.mjs`,
      `/dist/optimizer.mjs`,
      `/dist/server.mjs`,
      ...(isV2 ? [`/dist/serializer.mjs`] : []),
      ...(isV2 ? [`/dist/ts-optimizer.mjs`] : []),
      `/dist/qwikloader.js`,
      `/dist/preloader.mjs`,
      `/dist/worker/index.mjs`,
      `/dist/worker/worker.js`,
      `/dist/worker/worker.node.js`,
      `/dist/worker/worker.shared.js`,
    ]) {
      out[QWIK_PKG_NAME_V1][p] = getNpmCdnUrl(
        bundled,
        pkgName,
        qwikVersion,
        p.replace('/dist/', prefix)
      );
    }
    out[QWIK_PKG_NAME_V1]['/dist/core.d.ts'] = getNpmCdnUrl(
      bundled,
      pkgName,
      qwikVersion,
      isV2 ? '/dist/core-internal.d.ts' : `${prefix}core.d.ts`
    );
    out[QWIK_PKG_NAME_V2] = out[QWIK_PKG_NAME_V1];
    out['@qwik.dev/optimizer'] = {
      version: qwikVersion,
      '/bindings/qwik.wasm.mjs': getNpmCdnUrl(
        bundled,
        '@qwik.dev/optimizer',
        qwikVersion,
        '/bindings/qwik.wasm.mjs'
      ),
      '/bindings/qwik_wasm_bg.wasm': getNpmCdnUrl(
        bundled,
        '@qwik.dev/optimizer',
        qwikVersion,
        '/bindings/qwik_wasm_bg.wasm'
      ),
      '/dist/index.mjs': getNpmCdnUrl(
        bundled,
        '@qwik.dev/optimizer',
        qwikVersion,
        `${prefix}index.mjs`
      ),
    };
  }
  return out;
};
