/* eslint-disable no-console */
import type { BundledFiles, ReplInputOptions } from '../types';
import {
  QWIK_PKG_NAME,
  QWIK_REPL_DEPS_CACHE,
  ROLLUP_VERSION,
  TERSER_VERSION,
} from './repl-constants';
import type { QwikWorkerGlobal } from './repl-service-worker';

let options: ReplInputOptions;
let cache: Cache;

// Copied from bundled.tsx. Can't import it because it breaks the sw bundle.
const getNpmCdnUrl = (
  bundled: BundledFiles,
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

export const depResponse = async (pkgName: string, pkgVersion: string, pkgPath: string) => {
  const req = getNpmCdnRequest(pkgName, pkgVersion, pkgPath);
  const cachedRes = await cache.match(req);
  if (cachedRes) {
    return cachedRes;
  }
  const fetchRes = await fetch(req);
  if (fetchRes.ok) {
    if (/^(http|\/)/.test(req.url) && !req.url.includes('localhost')) {
      await cache.put(req, fetchRes.clone());
    }
    return fetchRes;
  }
};

const exec = async (cache: Cache, pkgName: string, pkgVersion: string, pkgPath: string) => {
  const res = await depResponse(pkgName, pkgVersion, pkgPath);
  if (res) {
    console.debug(`Run: ${res.url}`);
    // eslint-disable-next-line no-new-func
    const run = new Function(await res.clone().text());
    run();
  } else {
    throw new Error(
      `Unable to run: ${getNpmCdnUrl(options.bundled, pkgName, pkgVersion, pkgPath)}`
    );
  }
};

export const loadDependencies = async (replOptions: ReplInputOptions) => {
  options = replOptions;
  const qwikVersion = options.version;

  cache = await caches.open(QWIK_REPL_DEPS_CACHE);
  await Promise.all([
    depResponse(QWIK_PKG_NAME, qwikVersion, '/core.cjs'),
    depResponse(QWIK_PKG_NAME, qwikVersion, '/core.mjs'),
    depResponse(QWIK_PKG_NAME, qwikVersion, '/core.min.mjs'),
    depResponse(QWIK_PKG_NAME, qwikVersion, '/optimizer.cjs'),
    depResponse(QWIK_PKG_NAME, qwikVersion, '/server.cjs'),
    depResponse('rollup', ROLLUP_VERSION, '/dist/rollup.browser.js'),
    depResponse('prettier', 'bundled', '/standalone.js'),
    depResponse('prettier', 'bundled', '/plugins/html.js'),
  ]);

  self.qwikBuild = {
    isServer: true,
    isBrowser: false,
    isDev: false,
  };

  if (!isSameQwikVersion(self.qwikCore?.version, qwikVersion)) {
    await exec(cache, QWIK_PKG_NAME, qwikVersion, '/core.cjs');
    if (self.qwikCore) {
      console.debug(`Loaded @builder.io/qwik: ${self.qwikCore.version}`);
    } else {
      throw new Error(`Unable to load @builder.io/qwik ${qwikVersion}`);
    }
  }

  if (!isSameQwikVersion(self.qwikOptimizer?.versions.qwik, qwikVersion)) {
    await exec(cache, QWIK_PKG_NAME, qwikVersion, '/optimizer.cjs');
    if (self.qwikOptimizer) {
      console.debug(`Loaded @builder.io/qwik/optimizer: ${self.qwikOptimizer.versions.qwik}`);
    } else {
      throw new Error(`Unable to load @builder.io/qwik/optimizer ${qwikVersion}`);
    }
  }

  if (!isSameQwikVersion(self.qwikServer?.versions.qwik, qwikVersion)) {
    await exec(cache, QWIK_PKG_NAME, qwikVersion, '/server.cjs');
    if (self.qwikServer) {
      console.debug(`Loaded @builder.io/qwik/server: ${self.qwikServer.versions.qwik}`);
    } else {
      throw new Error(`Unable to load @builder.io/qwik/server ${qwikVersion}`);
    }
  }

  if (self.rollup?.VERSION !== ROLLUP_VERSION) {
    await exec(cache, 'rollup', ROLLUP_VERSION, '/dist/rollup.browser.js');
    if (self.rollup) {
      console.debug(`Loaded rollup: ${self.rollup!.VERSION}`);
    } else {
      throw new Error(`Unable to load rollup ${ROLLUP_VERSION}`);
    }
  }

  if (!self.prettier) {
    await exec(cache, 'prettier', 'bundled', '/standalone.js');
    await exec(cache, 'prettier', 'bundled', '/plugins/html.js');
    if (self.prettier) {
      console.debug(`Loaded prettier: ${(self.prettier as any)!.version}`);
    } else {
      throw new Error(`Unable to load prettier`);
    }
  }

  if (options.buildMode === 'production' && !self.Terser) {
    await depResponse('terser', TERSER_VERSION, '/dist/bundle.min.js');
    await exec(cache, 'terser', TERSER_VERSION, '/dist/bundle.min.js');
    if (self.Terser) {
      console.debug(`Loaded terser: ${TERSER_VERSION}`);
    } else {
      throw new Error(`Unable to load terser ${TERSER_VERSION}`);
    }
  }

  // clear out old cache
  // no need to wait
  cache.keys().then((keys) => {
    if (keys.length > 30) {
      for (let i = 0; i < 5; i++) {
        cache.delete(keys[i]);
      }
    }
  });
};

const getNpmCdnRequest = (pkgName: string, pkgVersion: string, pkgPath: string) => {
  return new Request(getNpmCdnUrl(options.bundled, pkgName, pkgVersion, pkgPath));
};

const isSameQwikVersion = (a: string | undefined, b: string) => {
  if (b === 'bundled') {
    b = options.bundled['@builder.io/qwik'].version;
  }
  if (!a || a !== b) {
    return false;
  }
  return true;
};

declare const self: QwikWorkerGlobal;
