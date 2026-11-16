import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { vectorNew } from '~/stats/vector';
import { type AppDatabase } from './index';
import { type ManifestRow, edgeTable, manifestTable } from './schema';
import { latencyColumnSums, toVector } from './query-helpers';

export async function dbGetManifests(
  db: AppDatabase,
  publicApiKey: string,
  { limit = 1000, offset = 0 }: { limit?: number; offset?: number } = {}
): Promise<Pick<ManifestRow, 'hash' | 'timestamp'>[]> {
  const latestTimestamp = sql`max(${manifestTable.timestamp})`.mapWith(manifestTable.timestamp);
  const manifests = await db
    .select({ hash: manifestTable.hash, timestamp: latestTimestamp })
    .from(manifestTable)
    .where(eq(manifestTable.publicApiKey, publicApiKey))
    .groupBy(manifestTable.hash)
    .orderBy(desc(latestTimestamp), manifestTable.hash)
    .limit(limit)
    .offset(offset)
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

  const latestManifestIds = sql`(
    select (
      select ${manifestTable.id}
      from ${manifestTable}
      where ${manifestTable.publicApiKey} = requested.value
      order by ${manifestTable.timestamp} desc, ${manifestTable.id} desc
      limit 1
    )
    from json_each(${JSON.stringify(publicApiKeys)}) as requested
  )`;

  const manifests = await db
    .select()
    .from(manifestTable)
    .where(inArray(manifestTable.id, latestManifestIds))
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
  { limit = 100, manifestHashes }: { limit?: number; manifestHashes?: string[] } = {}
): Promise<ManifestStatsRow[]> {
  const history = await dbGetManifests(db, publicApiKey, { limit });
  const manifests = manifestHashes
    ? history.filter((manifest) => manifestHashes.includes(manifest.hash))
    : history;
  if (manifests.length === 0) {
    return [];
  }
  const latencyRows = await db
    .select({
      hash: edgeTable.manifestHash,
      ...latencyColumnSums,
    })
    .from(edgeTable)
    .where(
      and(
        eq(edgeTable.publicApiKey, publicApiKey),
        inArray(
          edgeTable.manifestHash,
          manifests.map((manifest) => manifest.hash)
        )
      )
    )
    .groupBy(edgeTable.manifestHash)
    .all();
  const latencyByHash = new Map(
    latencyRows.map((row) => [row.hash, toVector('sumLatencyCount', row)])
  );
  return manifests.map((manifest) => ({
    ...manifest,
    latency: latencyByHash.get(manifest.hash) ?? vectorNew(),
  }));
}

export async function dbGetManifestInfo(
  db: AppDatabase,
  publicApiKey: string,
  manifestHash: string
): Promise<ManifestRow> {
  const lookup = db
    .select()
    .from(manifestTable)
    .where(and(eq(manifestTable.publicApiKey, publicApiKey), eq(manifestTable.hash, manifestHash)));
  const existing = await lookup.get();
  if (existing) {
    return existing;
  }
  const inserted = await db
    .insert(manifestTable)
    .values({
      publicApiKey,
      hash: manifestHash,
      timestamp: new Date(),
    })
    .onConflictDoNothing()
    .returning()
    .all();
  const manifest = inserted.at(0) ?? (await lookup.get());
  if (!manifest) {
    throw new Error('Manifest could not be registered');
  }
  return manifest;
}

export async function dbGetManifestHashes(
  db: AppDatabase,
  publicApiKey: string,
  { limit = 100, offset = 0 }: { limit?: number; offset?: number } = {}
): Promise<string[]> {
  const manifests = await dbGetManifests(db, publicApiKey, { limit, offset });
  return manifests.map((manifest) => manifest.hash);
}
