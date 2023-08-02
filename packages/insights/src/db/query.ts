import { and, eq, isNull, sql, inArray } from 'drizzle-orm';
import { type AppDatabase } from '.';
import { applicationTable, edgeTable, symbolDetailTable, symbolTable } from './schema';
import {
  createEdgeRow,
  delayBucketField,
  computeLatency,
  edgeTableDelayCount,
  latencyBucketField,
  toVector,
  latencyColumnSums,
  delayColumnSums,
} from './query-helpers';

export async function getEdges(
  db: AppDatabase,
  publicApiKey: string,
  { limit }: { limit?: number } = {}
) {
  const query = db
    .select({
      from: edgeTable.from,
      to: edgeTable.to,
      ...latencyColumnSums,
      ...delayColumnSums,
    })
    .from(edgeTable)
    .where(eq(edgeTable.publicApiKey, publicApiKey))
    .groupBy(edgeTable.from, edgeTable.to)
    .limit(limit || Number.MAX_SAFE_INTEGER);
  const rows = await query.all();
  console.log('COUNT', rows.length);
  return rows.map((e) => ({
    from: e.from,
    to: e.to,
    delay: toVector('sumDelayCount', e),
    latency: toVector('sumLatencyCount', e),
  }));
}

export async function getSlowEdges(db: AppDatabase, publicApiKey: string, manifests: string[]) {
  let where = eq(edgeTable.publicApiKey, publicApiKey);
  if (manifests.length) {
    where = and(where, inArray(edgeTable.manifestHash, manifests))!;
  }
  const query = db
    .select({
      manifestHash: edgeTable.manifestHash,
      to: edgeTable.to,
      ...latencyColumnSums,
    })
    .from(edgeTable)
    .where(where)
    .groupBy(edgeTable.manifestHash, edgeTable.to)
    .orderBy(sql`${computeLatency} DESC`)
    .limit(400);
  return (await query.all()).map((e) => ({
    manifestHash: e.manifestHash,
    to: e.to,
    latency: toVector('sumLatencyCount' as const, e),
  }));
}

export function getSymbolDetails(db: AppDatabase, publicApiKey: string) {
  return db
    .select({
      hash: symbolDetailTable.hash,
      fullName: symbolDetailTable.fullName,
      origin: symbolDetailTable.origin,
      lo: symbolDetailTable.lo,
      hi: symbolDetailTable.hi,
    })
    .from(symbolDetailTable)
    .where(eq(symbolDetailTable.publicApiKey, publicApiKey))
    .all();
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
  github: string | null;
}> {
  let app = await db
    .select()
    .from(applicationTable)
    .where(eq(applicationTable.publicApiKey, publicApiKey))
    .get();
  if (!(app as {} | undefined) && options.autoCreate) {
    const appFields = {
      name: 'Auto create: ' + publicApiKey,
      description: 'Auto create: ' + publicApiKey,
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
        ? 'https://github.com/BuilderIO/qwik/blob/main/packages/docs/src'
        : null,
    ...app,
  };
}

export async function getEdgeCount(db: AppDatabase, publicApiKey: string): Promise<number> {
  return (
    await db
      .select({ count: edgeTableDelayCount })
      .from(edgeTable)
      .where(eq(edgeTable.publicApiKey, publicApiKey))
      .get()
  ).count;
}

export async function getSymbolEdgeCount(db: AppDatabase, publicApiKey: string): Promise<number> {
  return (
    await db
      .select({ count: sql<number>`count(*)` })
      .from(symbolTable)
      .where(eq(symbolTable.publicApiKey, publicApiKey))
      .get()
  ).count;
}

export async function updateEdge(
  db: AppDatabase,
  edge: {
    publicApiKey: string;
    manifestHash: string;
    from: string | null;
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
        edge.from === null ? isNull(edgeTable.from) : eq(edgeTable.from, edge.from),
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
