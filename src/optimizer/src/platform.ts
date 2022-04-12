import { logWarn } from '../../core/util/log';
import type { Path, TransformOutput } from '.';
import * as pathBrowser from '../../core/util/path';
import { QWIK_BINDING_MAP } from './qwik-binding-map';
import { versions } from './versions';

export async function getSystem() {
  const sys: InternalSystem = {} as any;
  sys.path = pathBrowser;

  if (globalThis.IS_ESM) {
    sys.dynamicImport = (path: string) => import(path);
  }

  if (isBrowserMain()) {
    // Main Browser Thread
    sys.isBrowserMain = true;
  } else if (isNodeJs()) {
    // NodeJS
    sys.isNode = true;
    sys.arch = process.arch;
    sys.platform = process.platform;
  } else if (isWebWorker()) {
    // Web Worker
    sys.isWebWorker = true;
  }

  if (globalThis.IS_CJS) {
    if (sys.isNode) {
      // using this api object as a way to ensure bundlers
      // do not try to inline or rewrite require()
      sys.dynamicImport = (path) => require(path);

      if (typeof globalThis === 'undefined') {
        global.globalThis = global;
      }
      if (typeof TextEncoder === 'undefined') {
        // TextEncoder/TextDecoder needs to be on the global scope for the WASM file
        // https://nodejs.org/api/util.html#class-utiltextdecoder
        const nodeUtil: any = sys.dynamicImport('util');
        global.TextEncoder = nodeUtil.TextEncoder;
        global.TextDecoder = nodeUtil.TextDecoder;
      }
    } else if (sys.isWebWorker) {
      if (typeof sys.dynamicImport !== 'function') {
        sys.dynamicImport = async (path: string) => {
          const cjsRsp = await fetch(path);
          const cjsCode = await cjsRsp.text();
          const cjsModule: any = { exports: {} };
          const cjsRun = new Function('module', 'exports', cjsCode);
          cjsRun(cjsModule, cjsModule.exports);
          return cjsModule.exports;
        };
      }
    }
  }

  if (sys.isNode) {
    sys.fs = await sys.dynamicImport('fs');
    sys.path = await sys.dynamicImport('path');
  }

  sys.binding = await loadPlatformBinding(sys);

  return sys;
}

async function loadPlatformBinding(sys: InternalSystem) {
  if (sys.isNode) {
    // NodeJS
    const platform = (QWIK_BINDING_MAP as any)[sys.platform!];
    if (platform) {
      const triples = platform[sys.arch!];
      if (triples) {
        for (const triple of triples) {
          // NodeJS - Native Binding
          try {
            const platformBindingPath = sys.path.join('bindings', triple.platformArchABI);
            const mod = await sys.dynamicImport('./' + platformBindingPath);
            return mod;
          } catch (e) {
            logWarn(e);
          }
        }
      }
    }
  }

  if (globalThis.IS_CJS) {
    // CJS WASM

    if (sys.isNode) {
      // CJS WASM NodeJS
      const cjsWasmPath = sys.path.join('bindings', 'qwik.wasm.cjs');
      const mod = await sys.dynamicImport('./' + cjsWasmPath);

      return new Promise<Buffer>((resolve, reject) => {
        sys.fs.readFile(
          sys.path.join(__dirname, 'bindings', 'qwik_wasm_bg.wasm'),
          undefined,
          (err, data) => {
            if (err != null) {
              reject(err);
            } else {
              resolve(data);
            }
          }
        );
      })
        .then((data) => WebAssembly.compile(data))
        .then((module) => mod.default(module))
        .then(() => mod);
    }

    if (sys.isWebWorker) {
      // CJS WASM Web Worker
      const cdnUrl = `https://cdn.jsdelivr.net/npm/@builder.io/qwik@${versions.qwik}/bindings/`;
      const cjsModuleUrl = new URL(`./qwik.wasm.cjs`, cdnUrl).href;
      const wasmUrl = new URL(`./qwik_wasm_bg.wasm`, cdnUrl).href;

      const [cjsModule, wasmRsp] = await Promise.all([
        sys.dynamicImport(cjsModuleUrl),
        fetch(wasmUrl),
      ]);
      await cjsModule.default(wasmRsp);

      return cjsModule;
    }
  }

  if (globalThis.IS_ESM) {
    // ESM WASM
    const mjsWasmPath = sys.path.join('bindings', 'qwik.wasm.mjs');
    const module = await sys.dynamicImport('./' + mjsWasmPath);
    await module.default();
    return module;
  }

  throw new Error(`Platform not supported`);
}

export interface InternalSystem {
  isNode?: boolean;
  isBrowserMain?: boolean;
  isWebWorker?: boolean;
  arch?: string;
  platform?: string;
  dynamicImport: (path: string) => Promise<any>;
  fs: typeof import('fs');
  path: Path;
  binding: PlatformBinding;
}

export interface PlatformBinding {
  transform_fs?: (opts: any) => TransformOutput;
  transform_modules: (opts: any) => TransformOutput;
}

export function isNodeJs() {
  return (
    typeof process !== 'undefined' &&
    process.versions &&
    process.versions.node &&
    typeof global !== 'undefined'
  );
}

export function isBrowserMain() {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof location !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof Window === 'function' &&
    typeof fetch === 'function'
  );
}

export function isWebWorker() {
  return (
    typeof self !== 'undefined' &&
    typeof location !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof fetch === 'function' &&
    typeof WorkerGlobalScope === 'function' &&
    typeof (self as any).importScripts === 'function'
  );
}

declare const globalThis: { IS_CJS: boolean; IS_ESM: boolean };
declare const global: { [key: string]: any };
declare const WorkerGlobalScope: any;
