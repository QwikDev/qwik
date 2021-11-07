import { platformArchTriples } from '@napi-rs/triples';
import type { TransformResult } from '.';

export async function loadPlatformBinding() {
  if (loadedBinding) {
    return loadedBinding;
  }

  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    // NodeJS
    const ArchName = process.arch;
    const PlatformName = process.platform;
    const triples = platformArchTriples[PlatformName][ArchName];

    if (typeof require === 'function') {
      // NodeJS - CommonJS Module
      const path = require('path');
      const fs = require('fs');

      for (const triple of triples) {
        const platformBindingPath = path.join(
          __dirname,
          `..`,
          `qwik.${triple.platformArchABI}.node`
        );
        if (fs.existsSync(platformBindingPath)) {
          // NodeJS Native Binding loaded with CJS
          loadedBinding = require(platformBindingPath);
          return loadedBinding!;
        }
      }

      const wasmBindingPath = path.join(`..`, `wasm-nodejs`);
      loadedBinding = require(wasmBindingPath);
      return loadedBinding!;
    }
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // @ts-ignore
    const module = await import('../wasm-web/qwik_wasm.js');
    await module.default();
    loadedBinding = {
      transform_modules: module.transform_modules,
    };
  }

  throw new Error(`Platform not supported`);
}

export interface PlatformBinding {
  transform_fs?: (opts: any) => TransformResult;
  transform_modules: (opts: any) => TransformResult;
}

let loadedBinding: PlatformBinding | null = null;
