import type { ReplInputOptions } from '../types';
import { QWIK_PKG_NAME, QWIK_REPL_DEPS_CACHE } from './repl-constants';

let options: ReplInputOptions;
let cache: Cache;

export const depResponse = async (pkgName: string, pkgPath: string) => {
  if (pkgName === QWIK_PKG_NAME && !pkgPath.startsWith('/bindings')) {
    const version = options.deps[pkgName].version;
    const [M, m, p] = version.split('-')[0].split('.').map(Number);
    if (M > 1 || (M == 1 && (m > 7 || (m == 7 && p >= 2)))) {
      pkgPath = `/dist${pkgPath}`;
    }
  }
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
  const realQwikVersion = options.deps[QWIK_PKG_NAME].version;

  cache = await caches.open(QWIK_REPL_DEPS_CACHE);

  (globalThis as any).qwikBuild = {
    isServer: true,
    isBrowser: false,
    isDev: false,
  } as typeof import('@builder.io/qwik/build') as any;

  const cachedCjsCode = `qwikWasmCjs${realQwikVersion}`;
  const cachedWasmRsp = `qwikWasmRsp${realQwikVersion}`;

  // Store the optimizer where platform.ts can find it
  let cjsCode: string = (globalThis as any)[cachedCjsCode];
  let wasmRsp: Response = (globalThis as any)[cachedWasmRsp];
  if (!cjsCode || !wasmRsp) {
    const cjsRes = await depResponse(QWIK_PKG_NAME, '/bindings/qwik.wasm.cjs');
    cjsCode = await cjsRes.text();
    (globalThis as any)[cachedCjsCode] = cjsCode;
    const res = await depResponse(QWIK_PKG_NAME, '/bindings/qwik_wasm_bg.wasm');
    wasmRsp = res;
    (globalThis as any)[cachedWasmRsp] = wasmRsp;
    console.debug(`Loaded Qwik WASM bindings ${realQwikVersion}`);
  }

  if (!isSameQwikVersion((globalThis as any).qwikCore?.version)) {
    await exec(QWIK_PKG_NAME, '/core.cjs');
    if ((globalThis as any).qwikCore) {
      console.debug(`Loaded @builder.io/qwik: ${(globalThis as any).qwikCore.version}`);
    } else {
      throw new Error(`Unable to load @builder.io/qwik ${qwikVersion}`);
    }
  }

  if (!isSameQwikVersion((globalThis as any).qwikOptimizer?.versions.qwik)) {
    await exec(QWIK_PKG_NAME, '/optimizer.cjs');
    if ((globalThis as any).qwikOptimizer) {
      console.debug(
        `Loaded @builder.io/qwik/optimizer: ${(globalThis as any).qwikOptimizer.versions.qwik}`
      );
    } else {
      throw new Error(`Unable to load @builder.io/qwik/optimizer ${qwikVersion}`);
    }
  }

  if (!isSameQwikVersion((globalThis as any).qwikServer?.versions.qwik)) {
    await exec(QWIK_PKG_NAME, '/server.cjs');
    if ((globalThis as any).qwikServer) {
      console.debug(
        `Loaded @builder.io/qwik/server: ${(globalThis as any).qwikServer.versions.qwik}`
      );
    } else {
      throw new Error(`Unable to load @builder.io/qwik/server ${qwikVersion}`);
    }
  }

  // Direct imports - no need for bundling in main thread
  if (!(globalThis as any).rollup) {
    const rollupModule = await (import('@rollup/browser') as Promise<any>);
    (globalThis as any).rollup = rollupModule.rollup;
    console.debug(`Loaded @rollup/browser`);
  }

  if (!(globalThis as any).memfs) {
    const memfsModule = await (import('memfs') as Promise<any>);
    (globalThis as any).memfs = memfsModule;
    console.debug(`Loaded memfs`);
  }

  if (!(globalThis as any).prettier) {
    const prettierModule = await (import('prettier') as Promise<any>);
    const prettierHtmlPlugin = await (import('prettier/plugins/html.js') as Promise<any>);
    (globalThis as any).prettier = prettierModule.default || prettierModule;
    (globalThis as any).prettierPlugins = {
      html: prettierHtmlPlugin.default || prettierHtmlPlugin,
    };
    console.debug(`Loaded prettier: ${(globalThis as any).prettier.version || 'unknown'}`);
  }

  if (options.buildMode === 'production' && !(globalThis as any).Terser) {
    const terserModule = await (import('terser') as Promise<any>);
    (globalThis as any).Terser = terserModule.default || terserModule;
    console.debug(`Loaded terser`);
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
