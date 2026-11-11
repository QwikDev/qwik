import { and, eq, inArray } from 'drizzle-orm';
import { edgeTable, routesTable, symbolDetailTable, type AppDatabase } from '.';
import { latencyColumnSums, toVector } from './query-helpers';
import { comparePerformance } from '~/routes/app/[publicApiKey]/performance';
import { vectorNew } from '~/stats/vector';

export async function getSymbolOverview(
  db: AppDatabase,
  publicApiKey: string,
  symbol: string,
  selectedHash: string | null,
  previousHash: string | null
) {
  if (!selectedHash) {
    return {
      comparison: comparePerformance([], []),
      current: [],
      previous: [],
      routes: [] as string[],
      metadata: undefined as { fullName: string; origin: string } | undefined,
    };
  }
  const hashes = [selectedHash, previousHash].filter((hash): hash is string => Boolean(hash));
  const [samples, routes, metadata] = await Promise.all([
    db
      .select({ hash: edgeTable.manifestHash, ...latencyColumnSums })
      .from(edgeTable)
      .where(
        and(
          eq(edgeTable.publicApiKey, publicApiKey),
          eq(edgeTable.to, symbol),
          inArray(edgeTable.manifestHash, hashes)
        )
      )
      .groupBy(edgeTable.manifestHash)
      .all(),
    db
      .selectDistinct({ route: routesTable.route })
      .from(routesTable)
      .where(
        and(
          eq(routesTable.publicApiKey, publicApiKey),
          eq(routesTable.symbol, symbol),
          eq(routesTable.manifestHash, selectedHash)
        )
      )
      .orderBy(routesTable.route)
      .limit(100)
      .all(),
    db
      .select({ fullName: symbolDetailTable.fullName, origin: symbolDetailTable.origin })
      .from(symbolDetailTable)
      .where(
        and(
          eq(symbolDetailTable.publicApiKey, publicApiKey),
          eq(symbolDetailTable.hash, symbol),
          eq(symbolDetailTable.manifestHash, selectedHash)
        )
      )
      .get(),
  ]);
  const selectedSamples = samples.find((row) => row.hash === selectedHash);
  const baselineSamples = samples.find((row) => row.hash === previousHash);
  const current = selectedSamples ? toVector('sumLatencyCount', selectedSamples) : vectorNew();
  const previous = baselineSamples ? toVector('sumLatencyCount', baselineSamples) : vectorNew();
  return {
    comparison: comparePerformance(current, previous),
    current,
    previous,
    routes: routes.map((row) => row.route),
    metadata,
  };
}
