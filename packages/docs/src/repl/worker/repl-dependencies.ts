/* eslint-disable no-console */
import type { ReplInputOptions } from '../types';
import { QWIK_PKG_NAME, QWIK_REPL_DEPS_CACHE } from './repl-constants';
import type { QwikWorkerGlobal } from './repl-service-worker';

let options: ReplInputOptions;
let cache: Cache;

export const depResponse = async (pkgName: string, pkgPath: string) => {
  const url = options.deps[pkgName][pkgPath];
  if (!url) {
    throw new Error(`No URL given for dep: ${pkgName}${pkgPath}`);
  }
  const req = new Request(url);
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
  throw new Error('Failed to fetch: ' + req.url);
};

const exec = async (pkgName: string, pkgPath: string) => {
  const res = await depResponse(pkgName, pkgPath);
  console.debug(`Run: ${pkgName}${pkgPath} ${res.url}`);
  // eslint-disable-next-line no-new-func
  const run = new Function(await res.text());
  run();
};

const _loadDependencies = async (replOptions: ReplInputOptions) => {
  options = replOptions;
  const qwikVersion = options.version;

  cache = await caches.open(QWIK_REPL_DEPS_CACHE);

  self.qwikBuild = {
    isServer: true,
    isBrowser: false,
    isDev: false,
  };

  if (!isSameQwikVersion(self.qwikCore?.version)) {
    await exec(QWIK_PKG_NAME, '/core.cjs');
    if (self.qwikCore) {
      console.debug(`Loaded @builder.io/qwik: ${self.qwikCore.version}`);
    } else {
      throw new Error(`Unable to load @builder.io/qwik ${qwikVersion}`);
    }
  }

  if (!isSameQwikVersion(self.qwikOptimizer?.versions.qwik)) {
    await exec(QWIK_PKG_NAME, '/optimizer.cjs');
    if (self.qwikOptimizer) {
      console.debug(`Loaded @builder.io/qwik/optimizer: ${self.qwikOptimizer.versions.qwik}`);
    } else {
      throw new Error(`Unable to load @builder.io/qwik/optimizer ${qwikVersion}`);
    }
  }

  if (!isSameQwikVersion(self.qwikServer?.versions.qwik)) {
    await exec(QWIK_PKG_NAME, '/server.cjs');
    if (self.qwikServer) {
      console.debug(`Loaded @builder.io/qwik/server: ${self.qwikServer.versions.qwik}`);
    } else {
      throw new Error(`Unable to load @builder.io/qwik/server ${qwikVersion}`);
    }
  }

  if (!self.rollup) {
    await exec('rollup', '/dist/rollup.browser.js');
    if (self.rollup) {
      console.debug(`Loaded rollup: ${(self.rollup as any).VERSION}`);
    } else {
      throw new Error(`Unable to load rollup`);
    }
  }

  if (!self.prettier) {
    await exec('prettier', '/standalone.js');
    await exec('prettier', '/plugins/html.js');
    if (self.prettier) {
      console.debug(`Loaded prettier: ${(self.prettier as any)!.version}`);
    } else {
      throw new Error(`Unable to load prettier`);
    }
  }

  if (options.buildMode === 'production' && !self.Terser) {
    await exec('terser', '/dist/bundle.min.js');
    if (self.Terser) {
      console.debug(`Loaded terser`);
    } else {
      throw new Error(`Unable to load terser`);
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

let loadP: Promise<void> | undefined;
let again = false;
export const loadDependencies = (replOptions: ReplInputOptions) => {
  if (loadP) {
    again = true;
  } else {
    loadP = _loadDependencies(replOptions).finally(() => {
      if (again) {
        again = false;
        loadP = undefined;
        return loadDependencies(replOptions);
      }
      loadP = undefined;
    });
  }
  return loadP;
};

const isSameQwikVersion = (a: string | undefined) => {
  if (!a || a !== options.deps[QWIK_PKG_NAME].version) {
    return false;
  }
  return true;
};

declare const self: QwikWorkerGlobal;
