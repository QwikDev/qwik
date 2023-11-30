import { type AppDatabase } from '~/db';
import { getEdges } from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { computeBundles, computeSymbolGraph, computeSymbolVectors } from '~/stats/edges';

export async function getBundleGrouping({
  publicApiKey,
  db,
}: {
  publicApiKey: string;
  db: AppDatabase;
}): Promise<Record<string, string>> {
  const symbols = await getEdges(db, publicApiKey, {
    manifestHashes: await dbGetManifestHashes(db, publicApiKey),
  });
  const rootSymbol = computeSymbolGraph(symbols);
  const vectors = computeSymbolVectors(rootSymbol);
  const bundles = computeBundles(vectors);
  const bundleMap: Record<string, string> = {};
  bundles.forEach((bundle) => {
    bundle.symbols.forEach((symbol) => {
      bundleMap[symbol.name] = bundle.name;
    });
  });
  return bundleMap;
}
