import { NUMBER_OF_BUCKETS, padBucket, toBucket, toBucketTimeline } from '../buckets';
import { type InsightsDb, openInsightsDb } from '../db';
import type { InsightsPayload } from '../insights';

/** Strip the chunk prefix before the last `_`; `hW` is Qwik's no-op handler, so ignore it. */
function cleanupSymbolName(symbolName?: string | null): string | null {
  if (!symbolName) {
    return null;
  }
  const shortName = symbolName.substring(symbolName.lastIndexOf('_') + 1);
  return shortName === 'hW' ? null : shortName;
}

const bucketColumns = (prefix: string) =>
  Array.from(
    { length: NUMBER_OF_BUCKETS },
    (_, i) => `${prefix}${padBucket(i)} INTEGER NOT NULL DEFAULT 0`
  ).join(', ');

const schemaReady = new WeakSet<InsightsDb>();
async function ensureSchema(db: InsightsDb): Promise<void> {
  if (schemaReady.has(db)) {
    return;
  }
  await db.exec(
    `CREATE TABLE IF NOT EXISTS applications (name TEXT, public_api_key TEXT, url TEXT);
     CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_key ON applications(public_api_key);
     CREATE TABLE IF NOT EXISTS edges ("from" TEXT, "to" TEXT NOT NULL, manifest_hash TEXT NOT NULL, public_api_key TEXT, interaction INTEGER NOT NULL DEFAULT 0, ${bucketColumns('delay_count_')}, ${bucketColumns('latency_count_')});
     CREATE INDEX IF NOT EXISTS idx_edges ON edges(public_api_key, manifest_hash, "from", "to");
     CREATE TABLE IF NOT EXISTS routes (public_api_key TEXT, manifest_hash TEXT NOT NULL, route TEXT NOT NULL, symbol TEXT NOT NULL, ${bucketColumns('timeline_')});
     CREATE INDEX IF NOT EXISTS idx_routes ON routes(public_api_key, manifest_hash, route, symbol);`
  );
  schemaReady.add(db);
}

const dbCache = new Map<string, Promise<InsightsDb>>();
function getDb(dbUrl: string): Promise<InsightsDb> {
  let db = dbCache.get(dbUrl);
  if (!db) {
    db = openInsightsDb(dbUrl, process.env.QWIK_INSIGHTS_DB_AUTH_TOKEN).then(async (opened) => {
      await ensureSchema(opened);
      return opened;
    });
    dbCache.set(dbUrl, db);
  }
  return db;
}

// Increment one delay + one latency bucket for an edge, inserting the row if it's new.
// Column names are derived from clamped bucket indices (never user input); values are bound.
async function updateEdge(
  db: InsightsDb,
  e: {
    publicApiKey: string;
    manifestHash: string;
    from: string | null;
    to: string;
    interaction: number;
    delayBucket: number;
    latencyBucket: number;
  }
): Promise<void> {
  const delayCol = `delay_count_${padBucket(e.delayBucket)}`;
  const latencyCol = `latency_count_${padBucket(e.latencyBucket)}`;
  const fromClause = e.from == null ? '"from" IS NULL' : '"from" = ?';
  const whereArgs =
    e.from == null
      ? [e.publicApiKey, e.manifestHash, e.to]
      : [e.publicApiKey, e.manifestHash, e.from, e.to];
  const updated = await db.run(
    `UPDATE edges SET ${delayCol} = ${delayCol} + 1, ${latencyCol} = ${latencyCol} + 1 WHERE public_api_key = ? AND manifest_hash = ? AND ${fromClause} AND "to" = ?`,
    whereArgs
  );
  if (updated.changes === 0) {
    await db.run(
      `INSERT INTO edges (public_api_key, manifest_hash, "from", "to", interaction, ${delayCol}, ${latencyCol}) VALUES (?, ?, ?, ?, ?, 1, 1)`,
      [e.publicApiKey, e.manifestHash, e.from, e.to, e.interaction]
    );
  }
}

async function updateRoutes(
  db: InsightsDb,
  r: {
    publicApiKey: string;
    manifestHash: string;
    route: string;
    symbol: string;
    timelineBucket: number;
  }
): Promise<void> {
  const timelineCol = `timeline_${padBucket(r.timelineBucket)}`;
  const updated = await db.run(
    `UPDATE routes SET ${timelineCol} = ${timelineCol} + 1 WHERE public_api_key = ? AND manifest_hash = ? AND route = ? AND symbol = ?`,
    [r.publicApiKey, r.manifestHash, r.route, r.symbol]
  );
  if (updated.changes === 0) {
    await db.run(
      `INSERT INTO routes (public_api_key, manifest_hash, route, symbol, ${timelineCol}) VALUES (?, ?, ?, ?, 1)`,
      [r.publicApiKey, r.manifestHash, r.route, r.symbol]
    );
  }
}

/**
 * Write one insights beacon into a libSQL/SQLite database, creating the schema on first use.
 * Mirrors the central ingest: per-symbol `from → to` edges plus `route → symbol` timings, bucketed.
 * The URL scheme selects the backend — local `file:` (node:sqlite) or remote Turso
 * (`@libsql/client`).
 *
 * @beta
 */
export async function writeInsights(dbUrl: string, payload: InsightsPayload): Promise<void> {
  const { publicApiKey, manifestHash } = payload;
  if (!publicApiKey || publicApiKey.length <= 4 || !Array.isArray(payload.symbols)) {
    return;
  }
  const db = await getDb(dbUrl);
  await db.run(`INSERT OR IGNORE INTO applications (public_api_key, name) VALUES (?, ?)`, [
    publicApiKey,
    publicApiKey,
  ]);

  let previousSymbol = cleanupSymbolName(payload.previousSymbol);
  for (let i = 0; i < payload.symbols.length; i++) {
    const event = payload.symbols[i];
    const symbolHash = cleanupSymbolName(event.symbol);
    if (symbolHash) {
      await updateEdge(db, {
        publicApiKey,
        manifestHash,
        from: previousSymbol,
        to: symbolHash,
        interaction: event.interaction ? 1 : 0,
        delayBucket: toBucket(event.delay),
        latencyBucket: toBucket(event.latency),
      });
      await updateRoutes(db, {
        publicApiKey,
        manifestHash,
        route: event.route,
        symbol: symbolHash,
        timelineBucket: toBucketTimeline(event.timeline),
      });
    }
    previousSymbol = symbolHash;
  }
}

/**
 * Resolve the libSQL URL: explicit option, then `QWIK_INSIGHTS_DB_URL`, then a local file.
 *
 * @beta
 */
export function resolveInsightsDbUrl(dbUrl?: string): string {
  return dbUrl || process.env.QWIK_INSIGHTS_DB_URL || 'file:.qwik/insights.db';
}

/**
 * Read an insights beacon from a request and record it. Never throws — a metrics beacon must not
 * break the response. Mount it in a Qwik Router route:
 *
 * ```ts
 * export const onPost: RequestHandler = async ({ request, json }) => {
 *   await handleInsightsBeacon(request);
 *   json(200, { ok: true });
 * };
 * ```
 *
 * @beta
 */
export async function handleInsightsBeacon(
  request: Request,
  opts: { dbUrl?: string } = {}
): Promise<void> {
  try {
    const payload = (await request.json()) as InsightsPayload;
    await writeInsights(resolveInsightsDbUrl(opts.dbUrl), payload);
  } catch {
    // Swallow: malformed beacon or DB hiccup must not fail the request.
  }
}
