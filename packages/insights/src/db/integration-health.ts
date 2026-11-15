import { and, countDistinct, eq, min } from 'drizzle-orm';
import { edgeTable, manifestTable, routesTable, symbolDetailTable, type AppDatabase } from '.';
import { getSourceSettings, loadSymbolSource } from './source';

export async function getIntegrationHealth(
  db: AppDatabase,
  publicApiKey: string,
  manifestHash: string | null
) {
  const source = await getSourceSettings(db, publicApiKey);
  if (!manifestHash) {
    return { firstSeen: null, observed: 0, mapped: 0, metadata: 0, routes: 0, source };
  }
  const [coverage, metadata, routes, manifest] = await Promise.all([
    db
      .select({
        observed: countDistinct(edgeTable.to),
        mapped: countDistinct(symbolDetailTable.hash),
      })
      .from(edgeTable)
      .leftJoin(
        symbolDetailTable,
        and(
          eq(symbolDetailTable.publicApiKey, edgeTable.publicApiKey),
          eq(symbolDetailTable.manifestHash, edgeTable.manifestHash),
          eq(symbolDetailTable.hash, edgeTable.to)
        )
      )
      .where(
        and(eq(edgeTable.publicApiKey, publicApiKey), eq(edgeTable.manifestHash, manifestHash))
      )
      .get(),
    db
      .select({ count: countDistinct(symbolDetailTable.hash) })
      .from(symbolDetailTable)
      .where(
        and(
          eq(symbolDetailTable.publicApiKey, publicApiKey),
          eq(symbolDetailTable.manifestHash, manifestHash)
        )
      )
      .get(),
    db
      .select({ count: countDistinct(routesTable.route) })
      .from(routesTable)
      .where(
        and(eq(routesTable.publicApiKey, publicApiKey), eq(routesTable.manifestHash, manifestHash))
      )
      .get(),
    db
      .select({ firstSeen: min(manifestTable.timestamp) })
      .from(manifestTable)
      .where(
        and(eq(manifestTable.publicApiKey, publicApiKey), eq(manifestTable.hash, manifestHash))
      )
      .get(),
  ]);
  return {
    firstSeen: manifest?.firstSeen?.toISOString() ?? null,
    observed: coverage?.observed ?? 0,
    mapped: coverage?.mapped ?? 0,
    metadata: metadata?.count ?? 0,
    routes: routes?.count ?? 0,
    source,
  };
}

export async function testSourceMapping(
  db: AppDatabase,
  publicApiKey: string,
  manifestHash: string,
  fetchSource: typeof fetch = fetch
) {
  const symbol = await db
    .select({ hash: symbolDetailTable.hash })
    .from(symbolDetailTable)
    .where(
      and(
        eq(symbolDetailTable.publicApiKey, publicApiKey),
        eq(symbolDetailTable.manifestHash, manifestHash)
      )
    )
    .orderBy(symbolDetailTable.hash)
    .limit(1)
    .get();
  if (!symbol) {
    return { status: 'missing-metadata', symbol: '', origin: '', originUrl: '', revision: '' };
  }
  const result = await loadSymbolSource(db, publicApiKey, symbol.hash, fetchSource, manifestHash);
  return {
    status: result.status,
    symbol: symbol.hash,
    origin: result.origin,
    originUrl: result.originUrl,
    revision: result.revision,
  };
}
