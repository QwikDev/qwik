import { createAffinityTree } from '~/stats/bundle-affinity';
import { getDB } from '~/db';
import { getSymbolGraphEdges, getSymbolDetailsByHashes } from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { computeBundles, computeSymbolGraph, computeSymbolVectors } from '~/stats/edges';
import { createBundleViewData } from './bundle-view';

export async function loadBundlePreview(publicApiKey: string, limit?: number) {
  const db = getDB();

  const manifestHashes = await dbGetManifestHashes(db, publicApiKey);
  const edges = await getSymbolGraphEdges(db, publicApiKey, { limit, manifestHashes });
  const symbolHashes = Array.from(
    new Set(
      edges
        .flatMap((edge) => [edge.from, edge.to])
        .filter((symbol): symbol is string => Boolean(symbol))
        .map((symbol) => symbol.split('_').pop()!)
    )
  );
  const details = await getSymbolDetailsByHashes(db, publicApiKey, symbolHashes);
  const rootSymbol = computeSymbolGraph(edges, details);
  const vectors = computeSymbolVectors(rootSymbol);
  const bundles = computeBundles(vectors);
  return {
    ...createBundleViewData(vectors, bundles),
    affinityTree: createAffinityTree(vectors.vectors),
  };
}
