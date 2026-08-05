import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { type AppDatabase } from '.';
import {
  computeLatency,
  createEdgeRow,
  createRouteRow,
  delayBucketField,
  delayColumns,
  delayColumnSumList,
  edgeTableDelayCount,
  latencyBucketField,
  latencyColumnSumList,
  latencyColumnSums,
  listToVector,
  timelineBucketField,
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
        latencyColumnSumList: latencyColumnSumList,
        delayColumnSumList: delayColumnSumList,
      })
      .from(edgeTable)
      .where(where)
      .groupBy(edgeTable.from, edgeTable.to)
      .limit(limit || 5_000); // TODO: The 5_000 limit is due to Turso serialization format not being efficient, upgrade this once Turso is fixed.
    const rows = await query.all();
    return rows.map((e) => ({
      from: e.from,
      to: e.to,
      delay: listToVector(e.delayColumnSumList),
      latency: listToVector(e.latencyColumnSumList),
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
      .orderBy(sql`${computeLatency} DESC`)
      .limit(400)
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
      .limit(1000)
      .all();
  });
}

export async function getAppInfo(
  db: AppDatabase,
  publicApiKey: string,
  options: { autoCreate?: boolean } = {}
): Promise<{
  id: number;
  name: string;
  description: string | null;
  publicApiKey: string;
  url: string | null;
  github: string | null;
}> {
  let app = await db
    .select()
    .from(applicationTable)
    .where(eq(applicationTable.publicApiKey, publicApiKey))
    .get();
  if (!app && options.autoCreate) {
    const appFields = {
      name: 'Auto create: ' + publicApiKey,
      description: 'Auto create: ' + publicApiKey,
      url: '',
      publicApiKey,
    };
    const response = await db.insert(applicationTable).values(appFields).run();
    app = {
      id: Number(response.lastInsertRowid),
      ...appFields,
    };
  }
  return {
    github:
      publicApiKey == '221smyuj5gl'
        ? 'https://github.com/QwikDev/qwik/blob/main/packages/docs/src'
        : null,
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

export async function updateEdge(
  db: AppDatabase,
  edge: {
    publicApiKey: string;
    manifestHash: string;
    from?: string | null;
    to: string;
    interaction: boolean;
    delayBucket: number;
    latencyBucket: number;
  }
): Promise<void> {
  // This may look like a good idea to run in a transaction, but it causes a lot of contention
  // and than other queries timeout. Yes not running in TX there is a risk of missed update, but
  // since we are a statistical model, it should not make much of a difference.
  const latencyField = latencyBucketField(edge.latencyBucket);
  const delayField = delayBucketField(edge.delayBucket);
  const result = await db
    .update(edgeTable)
    .set({
      [latencyField]: sql`${edgeTable[latencyField]} + 1`,
      [delayField]: sql`${edgeTable[delayField]} + 1`,
    })
    .where(
      and(
        eq(edgeTable.manifestHash, edge.manifestHash),
        eq(edgeTable.publicApiKey, edge.publicApiKey),
        edge.from == null ? isNull(edgeTable.from) : eq(edgeTable.from, edge.from),
        eq(edgeTable.to, edge.to)
      )
    )
    .run();
  if (result.rowsAffected === 0) {
    // No row was updated, so insert a new one
    const edgeRow = createEdgeRow(edge);
    edgeRow[latencyBucketField(edge.latencyBucket)]++;
    edgeRow[delayBucketField(edge.latencyBucket)]++;
    await db.insert(edgeTable).values(edgeRow).run();
  }
}

export async function updateRoutes(
  db: AppDatabase,
  row: {
    publicApiKey: string;
    manifestHash: string;
    route: string;
    symbol: string;
    timelineBucket: number;
  }
): Promise<void> {
  // This may look like a good idea to run in a transaction, but it causes a lot of contention
  // and than other queries timeout. Yes not running in TX there is a risk of missed update, but
  // since we are a statistical model, it should not make much of a difference.
  const timelineField = timelineBucketField(row.timelineBucket);
  const result = await db
    .update(routesTable)
    .set({
      [timelineField]: sql`${routesTable[timelineField]} + 1`,
    })
    .where(
      and(
        eq(routesTable.publicApiKey, row.publicApiKey),
        eq(routesTable.manifestHash, row.manifestHash),
        eq(routesTable.route, row.route),
        eq(routesTable.symbol, row.symbol)
      )
    )
    .run();
  if (result.rowsAffected === 0) {
    // No row was updated, so insert a new one
    const routeRow = createRouteRow(row);
    routeRow[timelineBucketField(row.timelineBucket)]++;
    await db.insert(routesTable).values(routeRow).run();
  }
}
