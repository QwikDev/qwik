import { createAffinityTree } from '~/stats/bundle-affinity';
import { getDB } from '~/db';
import { getSymbolGraphEdges, getSymbolDetails } from '~/db/query';
import { loadReportScope } from '~/db/report-scope';
import { computeBundles, computeSymbolGraph, computeSymbolVectors } from '~/stats/edges';
import { createBundleViewData } from './bundle-view';

export async function loadBundlePreview(
  publicApiKey: string,
  limit?: number,
  searchParams = new URLSearchParams()
) {
  const db = getDB();

  const { selectedHash } = await loadReportScope(db, publicApiKey, searchParams);
  const manifestHashes = selectedHash ? [selectedHash] : [];
  const edges = await getSymbolGraphEdges(db, publicApiKey, { limit, manifestHashes });
  const details = selectedHash ? await getSymbolDetails(db, publicApiKey, { manifestHashes }) : [];
  const rootSymbol = computeSymbolGraph(edges, details);
  const vectors = computeSymbolVectors(rootSymbol, true);
  const bundles = computeBundles(vectors);
  return {
    ...createBundleViewData(vectors, bundles),
    previewPaths: vectors.paths,
    affinityTree: createAffinityTree(vectors.vectors),
  };
}
