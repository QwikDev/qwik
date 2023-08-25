import { eq, and, type InferSelectModel, sql } from 'drizzle-orm';
import { type AppDatabase } from './index';
import { edgeTable, manifestTable } from './schema';
import { latencyColumnSums, toVector } from './query-helpers';

export async function dbGetManifests(
  db: AppDatabase,
  publicApiKey: string
): Promise<InferSelectModel<typeof manifestTable>[]> {
  const manifests = await db
    .select()
    .from(manifestTable)
    .where(and(eq(manifestTable.publicApiKey, publicApiKey)))
    .orderBy(sql`${manifestTable.timestamp} DESC`)
    .all();
  return manifests;
}

export async function dbGetManifestStats(db: AppDatabase, publicApiKey: string) {
  const manifests = await db
    .select({ hash: manifestTable.hash, timestamp: manifestTable.timestamp, ...latencyColumnSums })
    .from(manifestTable)
    .innerJoin(edgeTable, eq(edgeTable.manifestHash, manifestTable.hash))
    .where(and(eq(manifestTable.publicApiKey, publicApiKey)))
    .groupBy(manifestTable.hash)
    .orderBy(sql`${manifestTable.timestamp} DESC`)
    .all();
  return manifests.map((manifest) => {
    return {
      hash: manifest.hash,
      timestamp: manifest.timestamp,
      latency: toVector('sumLatencyCount' as const, manifest),
    };
  });
}

export async function dbGetManifestInfo(
  db: AppDatabase,
  publicApiKey: string,
  manifestHash: string
): Promise<InferSelectModel<typeof manifestTable>> {
  const manifest = await db
    .select()
    .from(manifestTable)
    .where(and(eq(manifestTable.publicApiKey, publicApiKey), eq(manifestTable.hash, manifestHash)))
    .get();
  if (manifest) {
    return manifest;
  } else {
    const manifestFields = {
      publicApiKey,
      hash: manifestHash,
      timestamp: new Date(),
    };
    const response = await db.insert(manifestTable).values(manifestFields).run();
    return {
      id: Number(response.lastInsertRowid),
      ...manifestFields,
    };
  }
}
