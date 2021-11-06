import { platformArchTriples } from '@napi-rs/triples';
import type { TransformResult } from '.';

export function loadPlatformBinding() {
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
    }

    // NodeJS WASM
    // TODO
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Browser WASM
    // TODO
  }

  throw new Error(`Platform not supported`);
}

export interface PlatformBinding {
  transformFs: (opts: any) => TransformResult;
  transformModules: (opts: any) => TransformResult;
}

let loadedBinding: PlatformBinding | null = null;
