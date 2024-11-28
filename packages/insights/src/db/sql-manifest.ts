import { eq, and, sql } from 'drizzle-orm';
import { type AppDatabase } from './index';
import { type ManifestRow, edgeTable, manifestTable } from './schema';
import { latencyColumnSums, latencyCount, toVector } from './query-helpers';

export async function dbGetManifests(
  db: AppDatabase,
  publicApiKey: string
): Promise<ManifestRow[]> {
  const manifests = await db
    .select()
    .from(manifestTable)
    .where(and(eq(manifestTable.publicApiKey, publicApiKey)))
    .orderBy(sql`${manifestTable.timestamp} DESC`)
    .limit(1000)
    .all();
  return manifests;
}

export interface ManifestStatsRow {
  hash: string;
  timestamp: Date;
  latency: number[];
}

export async function dbGetManifestStats(
  db: AppDatabase,
  publicApiKey: string
): Promise<ManifestStatsRow[]> {
  const manifests = await db
    .select({
      hash: manifestTable.hash,
      timestamp: manifestTable.timestamp,
      ...latencyColumnSums,
    })
    .from(manifestTable)
    .innerJoin(edgeTable, eq(edgeTable.manifestHash, manifestTable.hash))
    .where(and(eq(manifestTable.publicApiKey, publicApiKey)))
    .groupBy(manifestTable.hash)
    .orderBy(sql`${manifestTable.timestamp} DESC`)
    .limit(1000)
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
  { sampleSize }: { sampleSize?: number } = {}
): Promise<string[]> {
  if (typeof sampleSize !== 'number') {
    sampleSize = 100000;
  }
  const manifests = await db
    .select({ hash: manifestTable.hash, ...latencyCount })
    .from(manifestTable)
    .innerJoin(
      edgeTable,
      and(
        eq(edgeTable.publicApiKey, manifestTable.publicApiKey),
        eq(edgeTable.manifestHash, manifestTable.hash)
      )
    )
    .where(eq(manifestTable.publicApiKey, publicApiKey))
    .groupBy(manifestTable.hash)
    .orderBy(sql`${manifestTable.timestamp} DESC`)
    .limit(1000)
    .all();
  const hashes: string[] = [];
  let sum = 0;
  for (let i = 0; i < manifests.length; i++) {
    const row = manifests[i];
    hashes.push(row.hash);
    sum += row.latencyCount;
    if (sum > sampleSize) {
      break;
    }
  }
  return hashes;
}
