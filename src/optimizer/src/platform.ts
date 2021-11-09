import { platformArchTriples } from '@napi-rs/triples';
import type { Path, TransformResult } from '.';
import pathBrowserify from 'path-browserify';

export async function getSystem() {
  const sys: InternalSystem = {} as any;
  sys.path = pathBrowserify;

  if (globalThis.IS_ESM) {
    sys.dynamicImport = (path: string) => import(path);
  }

  if (
    typeof process !== 'undefined' &&
    process.versions &&
    process.versions.node &&
    typeof global !== 'undefined'
  ) {
    // NodeJS
    sys.isNode = true;
    sys.arch = process.arch;
    sys.platform = process.platform;
  }

  if (globalThis.IS_CJS && sys.isNode) {
    // using this api object as a way to ensure bundlers
    // do not try to inline or rewrite require()
    const api = Object.assign({ require: 'require' });
    sys.dynamicImport = global[api.require].bind(global);
    sys.__dirname = __dirname;
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
    const triples = platformArchTriples[sys.platform!][sys.arch!];

    for (const triple of triples) {
      const platformBindingPath = sys.path.join(
        sys.__dirname,
        `qwik.${triple.platformArchABI}.node`
      );
      if (sys.fs.existsSync(platformBindingPath)) {
        // NodeJS - Native Binding
        return sys.dynamicImport(platformBindingPath);
      }

      // NodeJS - WASM
      const wasmBindingPath = sys.path.join(sys.__dirname, `qwik.nodejs.js`);
      return sys.dynamicImport(wasmBindingPath);
    }
  }

  if (globalThis.IS_ESM) {
    // Browser ESM - WASM
    const module = await sys.dynamicImport('../qwik.web.js');
    await module.default();
    const esmBinding: PlatformBinding = {
      transform_modules: module.transform_modules,
    };
    return esmBinding;
  }

  throw new Error(`Platform not supported`);
}

export interface InternalSystem {
  isNode?: boolean;
  arch?: string;
  platform?: string;
  dynamicImport: (path: string) => Promise<any>;
  fs: typeof import('fs');
  path: Path;
  __dirname: string;
  binding: PlatformBinding;
}

export interface PlatformBinding {
  transform_fs?: (opts: any) => TransformResult;
  transform_modules: (opts: any) => TransformResult;
}

let loadedSys: InternalSystem | null = null;

declare var globalThis: { IS_CJS: boolean; IS_ESM: boolean };
declare var global: { [key: string]: any };
