import { eq, and, inArray, sql } from 'drizzle-orm';
import { type AppDatabase } from './index';
import { type ManifestRow, edgeTable, manifestTable } from './schema';
import { latencyColumnSums, toVector } from './query-helpers';

export async function dbGetManifests(
  db: AppDatabase,
  publicApiKey: string,
  { limit = 1000 }: { limit?: number } = {}
): Promise<ManifestRow[]> {
  const manifests = await db
    .select()
    .from(manifestTable)
    .where(and(eq(manifestTable.publicApiKey, publicApiKey)))
    .orderBy(sql`${manifestTable.timestamp} DESC`)
    .limit(limit)
    .all();
  return manifests;
}

export async function dbGetLatestManifests(
  db: AppDatabase,
  publicApiKeys: string[]
): Promise<ManifestRow[]> {
  if (publicApiKeys.length === 0) {
    return [];
  }

  const rankedManifests = db
    .select({
      id: manifestTable.id,
      publicApiKey: manifestTable.publicApiKey,
      hash: manifestTable.hash,
      timestamp: manifestTable.timestamp,
      rank: sql<number>`row_number() over (
        partition by ${manifestTable.publicApiKey}
        order by ${manifestTable.timestamp} desc, ${manifestTable.id} desc
      )`.as('manifest_rank'),
    })
    .from(manifestTable)
    .where(inArray(manifestTable.publicApiKey, publicApiKeys))
    .as('ranked_manifests');

  const manifests = await db
    .select({
      id: rankedManifests.id,
      publicApiKey: rankedManifests.publicApiKey,
      hash: rankedManifests.hash,
      timestamp: rankedManifests.timestamp,
    })
    .from(rankedManifests)
    .where(eq(rankedManifests.rank, 1))
    .all();

  const applicationOrder = new Map(
    publicApiKeys.map((publicApiKey, index) => [publicApiKey, index])
  );
  return manifests.sort(
    (a, b) =>
      (applicationOrder.get(a.publicApiKey ?? '') ?? Number.MAX_SAFE_INTEGER) -
      (applicationOrder.get(b.publicApiKey ?? '') ?? Number.MAX_SAFE_INTEGER)
  );
}

export interface ManifestStatsRow {
  hash: string;
  timestamp: Date;
  latency: number[];
}

export async function dbGetManifestStats(
  db: AppDatabase,
  publicApiKey: string,
  { limit = 100 }: { limit?: number } = {}
): Promise<ManifestStatsRow[]> {
  const manifestHashes = await dbGetManifestHashes(db, publicApiKey, { limit });
  if (manifestHashes.length === 0) {
    return [];
  }
  const manifests = await db
    .select({
      hash: manifestTable.hash,
      timestamp: manifestTable.timestamp,
      ...latencyColumnSums,
    })
    .from(manifestTable)
    .innerJoin(
      edgeTable,
      and(
        eq(edgeTable.publicApiKey, manifestTable.publicApiKey),
        eq(edgeTable.manifestHash, manifestTable.hash)
      )
    )
    .where(
      and(eq(manifestTable.publicApiKey, publicApiKey), inArray(manifestTable.hash, manifestHashes))
    )
    .groupBy(manifestTable.hash)
    .orderBy(sql`${manifestTable.timestamp} DESC`)
    .limit(limit)
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
): Promise<ManifestRow> {
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

export async function dbGetManifestHashes(
  db: AppDatabase,
  publicApiKey: string,
  { limit = 100, offset = 0 }: { limit?: number; offset?: number } = {}
): Promise<string[]> {
  const manifests = await db
    .select({ hash: manifestTable.hash })
    .from(manifestTable)
    .where(eq(manifestTable.publicApiKey, publicApiKey))
    .orderBy(sql`${manifestTable.timestamp} DESC`)
    .limit(limit)
    .offset(offset)
    .all();
  return manifests.map((manifest) => manifest.hash);
}
