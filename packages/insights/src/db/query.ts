import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { type AppDatabase } from '.';
import {
  delayColumns,
  delayColumnSums,
  edgeTableDelayCount,
  latencyColumnSums,
  toVector,
} from './query-helpers';
import {
  applicationTable,
  edgeTable,
  routesTable,
  symbolDetailTable,
  symbolTable,
  type SymbolDetailRow,
} from './schema';
import { time } from './logging';
import { BUCKETS } from '~/stats/vector';

const delayColumnsByBucket = Object.values(delayColumns);
const relationBoundary = BUCKETS.findIndex((bucket) => bucket.avg >= 250);
const relatedCount = sql<number>`sum(${sql.join(
  delayColumnsByBucket.slice(0, relationBoundary),
  sql.raw(' + ')
)})`;
const unrelatedCount = sql<number>`sum(${sql.join(
  delayColumnsByBucket.slice(relationBoundary),
  sql.raw(' + ')
)})`;

export async function getEdges(
  db: AppDatabase,
  publicApiKey: string,
  { limit, manifestHashes }: { limit?: number; manifestHashes: string[] }
) {
  return time('edgeTable.getEdges', async () => {
    const where = manifestHashes.length
      ? and(
          eq(edgeTable.publicApiKey, publicApiKey),
          inArray(edgeTable.manifestHash, manifestHashes)
        )
      : eq(edgeTable.publicApiKey, publicApiKey);

    const query = db
      .select({
        from: edgeTable.from,
        to: edgeTable.to,
        ...latencyColumnSums,
        ...delayColumnSums,
      })
      .from(edgeTable)
      .where(where)
      .groupBy(edgeTable.from, edgeTable.to)
      .limit(limit || 5_000); // TODO: The 5_000 limit is due to Turso serialization format not being efficient, upgrade this once Turso is fixed.
    const rows = await query.all();
    return rows.map((e) => ({
      from: e.from,
      to: e.to,
      delay: toVector('sumDelayCount', e),
      latency: toVector('sumLatencyCount', e),
    }));
  });
}

export async function getSymbolGraphEdges(
  db: AppDatabase,
  publicApiKey: string,
  { limit, manifestHashes }: { limit?: number; manifestHashes: string[] }
) {
  if (manifestHashes.length === 0) {
    return [];
  }
  return time('edgeTable.getSymbolGraphEdges', async () => {
    return db
      .select({
        from: edgeTable.from,
        to: edgeTable.to,
        relatedCount,
        unrelatedCount,
      })
      .from(edgeTable)
      .where(
        and(
          eq(edgeTable.publicApiKey, publicApiKey),
          inArray(edgeTable.manifestHash, manifestHashes)
        )
      )
      .groupBy(edgeTable.from, edgeTable.to)
      .limit(limit || 5_000)
      .all();
  });
}

export interface SlowEdge {
  manifestHash: string;
  to: string;
  latency: number[];
}

export async function getSlowEdges(
  db: AppDatabase,
  publicApiKey: string,
  manifests: string[]
): Promise<SlowEdge[]> {
  if (manifests.length === 0) {
    return [];
  }
  return time('edgeTable.getSlowEdges', async () => {
    const rows = await db
      .select({
        manifestHash: edgeTable.manifestHash,
        to: edgeTable.to,
        ...latencyColumnSums,
      })
      .from(edgeTable)
      .where(
        and(eq(edgeTable.publicApiKey, publicApiKey), inArray(edgeTable.manifestHash, manifests))
      )
      .groupBy(edgeTable.manifestHash, edgeTable.to)
      .all();
    return rows.map((edge) => ({
      manifestHash: edge.manifestHash,
      to: edge.to,
      latency: toVector('sumLatencyCount' as const, edge),
    }));
  });
}

export type SymbolDetailForApp = Pick<
  SymbolDetailRow,
  'hash' | 'fullName' | 'origin' | 'lo' | 'hi'
>;

export async function getSymbolDetails(
  db: AppDatabase,
  publicApiKey: string,
  { manifestHashes }: { manifestHashes: string[] }
): Promise<SymbolDetailForApp[]> {
  if (manifestHashes.length === 0) {
    return [];
  }
  return time('symbolDetailTable.getSymbolDetails', async () => {
    return db
      .select({
        hash: symbolDetailTable.hash,
        fullName: symbolDetailTable.fullName,
        origin: symbolDetailTable.origin,
        lo: symbolDetailTable.lo,
        hi: symbolDetailTable.hi,
      })
      .from(symbolDetailTable)
      .where(
        and(
          eq(symbolDetailTable.publicApiKey, publicApiKey),
          inArray(symbolDetailTable.manifestHash, manifestHashes)
        )
      )
      .all();
  });
}

export async function getSymbolDetailsByHashes(
  db: AppDatabase,
  publicApiKey: string,
  symbolHashes: string[]
): Promise<SymbolDetailForApp[]> {
  if (symbolHashes.length === 0) {
    return [];
  }
  return time('symbolDetailTable.getSymbolDetailsByHashes', async () => {
    return db
      .select({
        hash: symbolDetailTable.hash,
        fullName: symbolDetailTable.fullName,
        origin: symbolDetailTable.origin,
        lo: symbolDetailTable.lo,
        hi: symbolDetailTable.hi,
      })
      .from(symbolDetailTable)
      .where(
        and(
          eq(symbolDetailTable.publicApiKey, publicApiKey),
          inArray(symbolDetailTable.hash, symbolHashes)
        )
      )
      .groupBy(symbolDetailTable.hash)
      .all();
  });
}

export async function isRegisteredApp(db: AppDatabase, publicApiKey: string): Promise<boolean> {
  const app = await db
    .select({ id: applicationTable.id })
    .from(applicationTable)
    .where(eq(applicationTable.publicApiKey, publicApiKey))
    .get();
  return !!app;
}

export async function getAppInfo(
  db: AppDatabase,
  publicApiKey: string
): Promise<{
  id: number;
  name: string;
  description: string | null;
  publicApiKey: string;
  url: string | null;
}> {
  const app = await db
    .select()
    .from(applicationTable)
    .where(eq(applicationTable.publicApiKey, publicApiKey))
    .get();
  return {
    ...app!,
  };
}

export async function getEdgeCount(db: AppDatabase, publicApiKey: string): Promise<number> {
  return (await db
    .select({ count: edgeTableDelayCount })
    .from(edgeTable)
    .where(eq(edgeTable.publicApiKey, publicApiKey))
    .get())!.count;
}

export async function getSymbolEdgeCount(db: AppDatabase, publicApiKey: string): Promise<number> {
  return (await db
    .select({ count: sql<number>`count(*)` })
    .from(symbolTable)
    .where(eq(symbolTable.publicApiKey, publicApiKey))
    .get())!.count;
}
