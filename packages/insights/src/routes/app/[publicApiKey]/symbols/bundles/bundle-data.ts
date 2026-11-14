import { getDB } from '~/db';
import { getSymbolGraphEdges, getSymbolDetailsByHashes } from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { computeSymbolGraph, type Symbol } from '~/stats/edges';

export async function loadSymbolGraphData(publicApiKey: string, url: URL) {
  const db = getDB();
  const limit = url.searchParams.get('limit')
    ? parseInt(url.searchParams.get('limit')!)
    : undefined;

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
  return { graph: computeSymbolGraph(edges, details), edges };
}

export async function loadSymbolGraph(publicApiKey: string, url: URL) {
  return (await loadSymbolGraphData(publicApiKey, url)).graph;
}
