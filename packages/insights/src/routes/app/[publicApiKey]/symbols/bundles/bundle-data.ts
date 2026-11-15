import { getDB } from '~/db';
import { getSymbolGraphEdges, getSymbolDetails } from '~/db/query';
import { loadReportScope } from '~/db/report-scope';
import { computeSymbolGraph } from '~/stats/edges';

export async function loadSymbolGraph(publicApiKey: string, url: URL) {
  const db = getDB();
  const limit = url.searchParams.get('limit')
    ? parseInt(url.searchParams.get('limit')!)
    : undefined;

  const { selectedHash } = await loadReportScope(db, publicApiKey, url.searchParams);
  const manifestHashes = selectedHash ? [selectedHash] : [];
  const edges = await getSymbolGraphEdges(db, publicApiKey, { limit, manifestHashes });
  const details = selectedHash ? await getSymbolDetails(db, publicApiKey, { manifestHashes }) : [];
  return computeSymbolGraph(edges, details);
}
