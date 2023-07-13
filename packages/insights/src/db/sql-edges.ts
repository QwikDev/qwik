import { and, eq, inArray, sql } from 'drizzle-orm';
import { type AppDatabase } from './index';
import { edgeTableDelayCount, latencyColumnSums, delayColumnSums, toVector } from './query-helpers';
import { edgeTable } from './schema';

export async function dbGetOutgoingEdges(
  db: AppDatabase,
  publicApiKey: string,
  symbol: string,
  manifests: string[]
) {
  let where = and(eq(edgeTable.publicApiKey, publicApiKey), eq(edgeTable.from, symbol));
  if (manifests.length) {
    where = and(where, inArray(edgeTable.manifestHash, manifests))!;
  }
  const query = db
    .select({
      manifestHash: edgeTable.manifestHash,
      to: edgeTable.to,
      ...latencyColumnSums,
      ...delayColumnSums,
    })
    .from(edgeTable)
    .where(where)
    .groupBy(edgeTable.manifestHash, edgeTable.to)
    .orderBy(sql`${edgeTableDelayCount} DESC`)
    .limit(50);
  return (await query.all()).map((e) => {
    return {
      manifestHash: e.manifestHash,
      to: e.to,
      latency: toVector('sumLatencyCount' as const, e),
      delay: toVector('sumDelayCount' as const, e),
    };
  });
}
