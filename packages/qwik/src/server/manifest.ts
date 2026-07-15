import { getClientManifest } from '@qwik.dev/core';
import type { QwikManifest, ResolvedManifest, SymbolMapper } from './types';
import { getSymbolHash } from './platform';

/** @public */
export function resolveManifest(
  manifest?: Partial<QwikManifest | ResolvedManifest>
): ResolvedManifest | undefined {
  const builtManifest = getOptionalClientManifest();
  const mergedManifest = (manifest ? { ...builtManifest, ...manifest } : builtManifest) as
    | ResolvedManifest
    | QwikManifest
    | undefined;

  if (!mergedManifest || 'mapper' in mergedManifest) {
    return mergedManifest;
  }
  if (mergedManifest.mapping) {
    const mapper: SymbolMapper = {};
    for (const symbol in mergedManifest.mapping) {
      mapper[getSymbolHash(symbol)] = [symbol, mergedManifest.mapping[symbol]];
    }
    return {
      mapper,
      manifest: mergedManifest,
      injections: mergedManifest.injections || [],
    };
  }
  return undefined;
}

function getOptionalClientManifest(): QwikManifest | undefined {
  try {
    return getClientManifest() as QwikManifest | undefined;
  } catch {
    return undefined;
  }
}
