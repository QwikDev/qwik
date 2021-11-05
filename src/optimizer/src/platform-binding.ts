import { platformArchTriples } from '@napi-rs/triples';

export function loadPlatformBinding() {
  if (loadedBinding) {
    return loadedBinding;
  }

  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    // NodeJS
    return loadNodeBinding();
  }

  throw new Error(`Platform not supported`);
}

function loadNodeBinding() {
  const ArchName = process.arch;
  const PlatformName = process.platform;
  const triples = platformArchTriples[PlatformName][ArchName];
  const path = require('path');
  const fs = require('fs');

  for (const triple of triples) {
    const platformBindingPath = path.join(__dirname, `..`, `qwik.${triple.platformArchABI}.node`);
    if (fs.existsSync(platformBindingPath)) {
      loadedBinding = require(platformBindingPath);
      return loadedBinding!;
    }
  }
  throw new Error(`Unable to load Node Binding`);
}

export interface PlatformBinding {
  sync_fn: (num: number) => number;
}

let loadedBinding: PlatformBinding | null = null;
