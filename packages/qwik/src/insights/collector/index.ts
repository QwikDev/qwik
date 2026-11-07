import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { NUMBER_OF_BUCKETS, padBucket, toBucket, toBucketTimeline } from '../buckets';
import {
  describeInsightsDbError,
  type InsightsDb,
  type InsightsStatement,
  localInsightsDbPath,
  openInsightsDb,
  redactInsightsDbUrl,
} from '../db';
import type { InsightsError, InsightsPayload } from '../insights';
import { MAX_BEACON_BYTES, parseInsightsError, parseInsightsPayload } from './validate';

// Shared with the devtools Insights panel so both read the DB the same way.
export {
  type InsightsDb,
  type InsightsStatement,
  localInsightsDbPath,
  openInsightsDb,
  redactInsightsDbUrl,
} from '../db';

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

// Upsert conflict targets; `from` is NULL for root edges, and NULLs never conflict in SQLite.
const EDGE_KEY = `public_api_key, manifest_hash, ifnull("from", ''), "to"`;
const ROUTE_KEY = 'public_api_key, manifest_hash, route, symbol';

const schemaReady = new WeakSet<InsightsDb>();
async function ensureSchema(db: InsightsDb): Promise<void> {
  if (schemaReady.has(db)) {
    return;
  }
  await db.exec(
    `CREATE TABLE IF NOT EXISTS applications (name TEXT, public_api_key TEXT, url TEXT);
     CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_key ON applications(public_api_key);
     CREATE TABLE IF NOT EXISTS edges ("from" TEXT, "to" TEXT NOT NULL, manifest_hash TEXT NOT NULL, public_api_key TEXT, interaction INTEGER NOT NULL DEFAULT 0, ${bucketColumns('delay_count_')}, ${bucketColumns('latency_count_')});
     CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_key ON edges(${EDGE_KEY});
     CREATE TABLE IF NOT EXISTS routes (public_api_key TEXT, manifest_hash TEXT NOT NULL, route TEXT NOT NULL, symbol TEXT NOT NULL, ${bucketColumns('timeline_')});
     CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_key ON routes(${ROUTE_KEY});
     CREATE TABLE IF NOT EXISTS manifests (public_api_key TEXT NOT NULL, hash TEXT NOT NULL, first_seen INTEGER NOT NULL);
     CREATE UNIQUE INDEX IF NOT EXISTS idx_manifests_key ON manifests(public_api_key, hash);
     CREATE TABLE IF NOT EXISTS errors (public_api_key TEXT, manifest_hash TEXT NOT NULL, timestamp INTEGER, url TEXT, source TEXT, line INTEGER, "column" INTEGER, message TEXT, error TEXT, stack TEXT);`
  );
  schemaReady.add(db);
}

const dbCache = new Map<string, Promise<InsightsDb>>();
function getDb(dbUrl: string): Promise<InsightsDb> {
  let db = dbCache.get(dbUrl);
  if (!db) {
    db = openWritableDb(dbUrl);
    dbCache.set(dbUrl, db);
    // Don't pin a failed open: the next beacon retries (e.g. once the directory exists).
    db.catch(() => dbCache.delete(dbUrl));
  }
  return db;
}

async function openWritableDb(dbUrl: string): Promise<InsightsDb> {
  const path = localInsightsDbPath(dbUrl);
  if (path !== null) {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = await openInsightsDb(dbUrl, process.env.QWIK_INSIGHTS_DB_AUTH_TOKEN);
  try {
    await ensureSchema(db);
  } catch (error) {
    // Each retry opens a new adapter, so don't leak this one.
    try {
      db.close();
    } catch {
      // The schema error is the one worth reporting.
    }
    throw error;
  }
  return db;
}

const reportedFailures = new Set<string>();
function warnOnce(message: string, error: unknown): void {
  // libSQL errors can echo the DB URL, token included, so only keep the redacted text.
  const details = describeInsightsDbError(error);
  const key = message + details;
  if (!reportedFailures.has(key)) {
    reportedFailures.add(key);
    console.warn(`qwikInsights collector: ${message}`, details);
  }
}

// Increment one delay + one latency bucket for an edge, inserting the row if it's new.
// Column names are derived from clamped bucket indices (never user input); values are bound.
function edgeUpsert(e: {
  publicApiKey: string;
  manifestHash: string;
  from: string | null;
  to: string;
  interaction: number;
  delayBucket: number;
  latencyBucket: number;
}): InsightsStatement {
  const delayCol = `delay_count_${padBucket(e.delayBucket)}`;
  const latencyCol = `latency_count_${padBucket(e.latencyBucket)}`;
  return {
    sql: `INSERT INTO edges (public_api_key, manifest_hash, "from", "to", interaction, ${delayCol}, ${latencyCol}) VALUES (?, ?, ?, ?, ?, 1, 1)
      ON CONFLICT (${EDGE_KEY}) DO UPDATE SET ${delayCol} = ${delayCol} + 1, ${latencyCol} = ${latencyCol} + 1, interaction = max(interaction, excluded.interaction)`,
    args: [e.publicApiKey, e.manifestHash, e.from, e.to, e.interaction],
  };
}

function routeUpsert(r: {
  publicApiKey: string;
  manifestHash: string;
  route: string;
  symbol: string;
  timelineBucket: number;
}): InsightsStatement {
  const timelineCol = `timeline_${padBucket(r.timelineBucket)}`;
  return {
    sql: `INSERT INTO routes (public_api_key, manifest_hash, route, symbol, ${timelineCol}) VALUES (?, ?, ?, ?, 1)
      ON CONFLICT (${ROUTE_KEY}) DO UPDATE SET ${timelineCol} = ${timelineCol} + 1`,
    args: [r.publicApiKey, r.manifestHash, r.route, r.symbol],
  };
}

/**
 * Write one insights beacon into a libSQL/SQLite database, creating the schema on first use.
 * Mirrors the central ingest: per-symbol `from → to` edges plus `route → symbol` timings, bucketed.
 * The URL scheme selects the backend — local `file:` (node:sqlite) or remote Turso
 * (`@libsql/client`).
 *
 * The payload is validated first (types and size limits), so it may come straight from a request.
 * Resolves to whether the beacon was recorded.
 *
 * @beta
 */
export async function writeInsights(dbUrl: string, beacon: InsightsPayload): Promise<boolean> {
  const payload = parseInsightsPayload(beacon);
  if (!payload) {
    return false;
  }
  const { publicApiKey, manifestHash } = payload;
  const statements: InsightsStatement[] = [
    {
      sql: `INSERT OR IGNORE INTO applications (public_api_key, name) VALUES (?, ?)`,
      args: [publicApiKey, publicApiKey],
    },
    // First sighting of a build, so the strategy can prefer the most recent builds.
    {
      sql: `INSERT OR IGNORE INTO manifests (public_api_key, hash, first_seen) VALUES (?, ?, ?)`,
      args: [publicApiKey, manifestHash, Date.now()],
    },
  ];

  let previousSymbol = cleanupSymbolName(payload.previousSymbol);
  for (let i = 0; i < payload.symbols.length; i++) {
    const event = payload.symbols[i];
    const symbolHash = cleanupSymbolName(event.symbol);
    if (symbolHash) {
      statements.push(
        edgeUpsert({
          publicApiKey,
          manifestHash,
          from: previousSymbol,
          to: symbolHash,
          interaction: event.interaction ? 1 : 0,
          delayBucket: toBucket(event.delay),
          latencyBucket: toBucket(event.latency),
        }),
        routeUpsert({
          publicApiKey,
          manifestHash,
          route: event.route,
          symbol: symbolHash,
          timelineBucket: toBucketTimeline(event.timeline),
        })
      );
    }
    previousSymbol = symbolHash;
  }
  const db = await getDb(dbUrl);
  await db.batch(statements);
  return true;
}

/** Record one client error beacon, ignoring other apps' errors when `expectedKey` is set. */
async function writeInsightsError(
  dbUrl: string,
  beacon: unknown,
  expectedKey: string | undefined
): Promise<boolean> {
  const error: InsightsError | null = parseInsightsError(beacon);
  if (!error || (expectedKey && error.publicApiKey !== expectedKey)) {
    return false;
  }
  const db = await getDb(dbUrl);
  await db.batch([
    {
      sql: `INSERT INTO errors (public_api_key, manifest_hash, timestamp, url, source, line, "column", message, error, stack) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        error.publicApiKey ?? null,
        error.manifestHash,
        error.timestamp,
        error.url,
        error.source,
        error.line,
        error.column,
        error.message,
        error.error,
        error.stack,
      ],
    },
  ]);
  return true;
}

/** The body as text, or null once it exceeds `maxBytes` (chunked bodies have no content-length). */
async function readBoundedText(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) {
    return '';
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let byteLength = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    byteLength += chunk.value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

// The pinger posts errors to `${postUrl}error/`, next to the symbol beacons.
const isErrorBeacon = (request: Request) => /\/error\/?$/.test(new URL(request.url).pathname);

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
 * break the response — and resolves to whether the beacon was recorded. The endpoint is public, so
 * pass `publicApiKey` to only accept your own app's beacons. Client errors arrive at
 * `${postUrl}error/`, so mount it as a catch-all route, e.g.
 * `src/routes/insights-collect/[...path]/index.ts`:
 *
 * ```ts
 * export const onPost: RequestHandler = async ({ request, json }) => {
 *   json(200, { ok: await handleInsightsBeacon(request) });
 * };
 * ```
 *
 * @beta
 */
export async function handleInsightsBeacon(
  request: Request,
  opts: { dbUrl?: string; publicApiKey?: string } = {}
): Promise<boolean> {
  let beacon: InsightsPayload;
  try {
    if (Number(request.headers.get('content-length')) > MAX_BEACON_BYTES) {
      return false;
    }
    const body = await readBoundedText(request, MAX_BEACON_BYTES);
    if (body === null) {
      return false;
    }
    beacon = JSON.parse(body);
  } catch {
    // A malformed beacon is client noise, not a server problem.
    return false;
  }
  const dbUrl = resolveInsightsDbUrl(opts.dbUrl);
  const isError = isErrorBeacon(request);
  if (!isError && opts.publicApiKey && beacon?.publicApiKey !== opts.publicApiKey) {
    return false;
  }
  try {
    if (isError) {
      return await writeInsightsError(dbUrl, beacon, opts.publicApiKey);
    }
    return await writeInsights(dbUrl, beacon);
  } catch (error) {
    warnOnce(`failed to record a beacon into ${redactInsightsDbUrl(dbUrl)}`, error);
    return false;
  }
}
