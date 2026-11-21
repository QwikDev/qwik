import { NUMBER_OF_BUCKETS, padBucket, toBucket, toBucketTimeline } from '../buckets';
import {
  describeInsightsDbError,
  type InsightsDb,
  type InsightsStatement,
  localInsightsDbPath,
  openInsightsDb,
  readInsightsEnv,
  redactInsightsDbUrl,
} from '../db';
import type { InsightsError, InsightsPayload } from '../insights';
import { migrateInsightsDb } from './schema';
import { MAX_BEACON_BYTES, parseInsightsError, parseInsightsPayload } from './validate';

// Shared with the devtools Insights panel so both read the DB the same way.
export {
  type InsightsDb,
  type InsightsStatement,
  type LibsqlClientLike,
  libsqlInsightsDb,
  localInsightsDbPath,
  openInsightsDb,
  redactInsightsDbUrl,
} from '../db';
export { migrateInsightsDb } from './schema';

/** Strip the chunk prefix before the last `_`; `hW` is Qwik's no-op handler, so ignore it. */
function cleanupSymbolName(symbolName?: string | null): string | null {
  if (!symbolName) {
    return null;
  }
  const shortName = symbolName.substring(symbolName.lastIndexOf('_') + 1);
  return shortName === 'hW' ? null : shortName;
}

const bucketColumns = (prefix: string) =>
  Array.from({ length: NUMBER_OF_BUCKETS }, (_, i) => `${prefix}${padBucket(i)}`);
const DELAY_COLUMNS = bucketColumns('delay_count_');
const LATENCY_COLUMNS = bucketColumns('latency_count_');
const TIMELINE_COLUMNS = bucketColumns('timeline_');
// The dashboard schema has no defaults for its bucket columns, so new rows list them all.
const zeros = (columns: string[]) => columns.map(() => '0').join(', ');

const dbCache = new Map<string, Promise<InsightsDb>>();
function getDb(dbUrl: string, authToken?: string): Promise<InsightsDb> {
  let db = dbCache.get(dbUrl);
  if (!db) {
    db = openWritableDb(dbUrl, authToken ?? readInsightsEnv('QWIK_INSIGHTS_DB_AUTH_TOKEN'));
    dbCache.set(dbUrl, db);
    // Don't pin a failed open: the next beacon retries (e.g. once the directory exists).
    db.catch(() => dbCache.delete(dbUrl));
  }
  return db;
}

async function openWritableDb(dbUrl: string, authToken: string | undefined): Promise<InsightsDb> {
  const path = localInsightsDbPath(dbUrl);
  if (path !== null) {
    // Loaded only for local files, so edge runtimes with a remote DB never need Node modules.
    const [{ mkdirSync }, { dirname }] = await Promise.all([
      import('node:fs'),
      import('node:path'),
    ]);
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = await openInsightsDb(dbUrl, authToken);
  try {
    await migrateInsightsDb(db);
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

const EDGE_MATCH = `public_api_key = ? AND manifest_hash = ? AND "from" IS ? AND "to" = ?`;

// Edges have no unique key, so add a missing row, then count into one row, in one transaction.
// Column names come from clamped bucket indices (never user input); values are bound.
function edgeIncrement(e: {
  publicApiKey: string;
  manifestHash: string;
  from: string | null;
  to: string;
  interaction: number;
  delayBucket: number;
  latencyBucket: number;
}): InsightsStatement[] {
  const match = [e.publicApiKey, e.manifestHash, e.from, e.to];
  const delayCol = DELAY_COLUMNS[e.delayBucket];
  const latencyCol = LATENCY_COLUMNS[e.latencyBucket];
  return [
    {
      sql: `INSERT INTO edges (public_api_key, manifest_hash, "from", "to", interaction, ${DELAY_COLUMNS.join(', ')}, ${LATENCY_COLUMNS.join(', ')})
        SELECT ?, ?, ?, ?, 0, ${zeros(DELAY_COLUMNS)}, ${zeros(LATENCY_COLUMNS)}
        WHERE NOT EXISTS (SELECT 1 FROM edges WHERE ${EDGE_MATCH})`,
      args: [...match, ...match],
    },
    {
      sql: `UPDATE edges SET ${delayCol} = ${delayCol} + 1, ${latencyCol} = ${latencyCol} + 1, interaction = max(interaction, ?)
        WHERE id = (SELECT min(id) FROM edges WHERE ${EDGE_MATCH})`,
      args: [e.interaction, ...match],
    },
  ];
}

function routeIncrement(r: {
  publicApiKey: string;
  manifestHash: string;
  route: string;
  symbol: string;
  timelineBucket: number;
}): InsightsStatement {
  const timelineCol = TIMELINE_COLUMNS[r.timelineBucket];
  const values = TIMELINE_COLUMNS.map((column) => (column === timelineCol ? '1' : '0')).join(', ');
  return {
    sql: `INSERT INTO routes (public_api_key, manifest_hash, route, symbol, ${TIMELINE_COLUMNS.join(', ')}) VALUES (?, ?, ?, ?, ${values})
      ON CONFLICT (public_api_key, manifest_hash, route, symbol) DO UPDATE SET ${timelineCol} = ${timelineCol} + 1`,
    args: [r.publicApiKey, r.manifestHash, r.route, r.symbol],
  };
}

// The dashboard indexes manifests without a unique key, so guard the insert instead.
const manifestInsert = (publicApiKey: string, manifestHash: string): InsightsStatement => ({
  sql: `INSERT INTO manifests (public_api_key, hash, timestamp) SELECT ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM manifests WHERE public_api_key = ? AND hash = ?)`,
  args: [publicApiKey, manifestHash, Date.now(), publicApiKey, manifestHash],
});

const applicationInsert = (publicApiKey: string): InsightsStatement => ({
  sql: `INSERT OR IGNORE INTO applications (public_api_key, name) VALUES (?, ?)`,
  args: [publicApiKey, publicApiKey],
});

/**
 * Options for the `record*` functions, which write into an already opened insights DB.
 *
 * @internal
 */
export interface RecordInsightsOptions {
  /** Add unknown apps to `applications`; the hosted dashboard registers apps itself. */
  registerApplication?: boolean;
}

/**
 * Validate one symbol beacon and record it into an open insights DB in one transaction: per-symbol
 * `from → to` edges and `route → symbol` timings, bucketed. Resolves to whether it was recorded.
 *
 * @internal
 */
export async function recordInsightsBeacon(
  db: InsightsDb,
  beacon: unknown,
  { registerApplication = false }: RecordInsightsOptions = {}
): Promise<boolean> {
  const payload = parseInsightsPayload(beacon);
  if (!payload) {
    return false;
  }
  const { publicApiKey, manifestHash } = payload;
  const statements: InsightsStatement[] = registerApplication
    ? [applicationInsert(publicApiKey)]
    : [];
  // First sighting of a build, so reports and the strategy can prefer the most recent builds.
  statements.push(manifestInsert(publicApiKey, manifestHash));

  let previousSymbol = cleanupSymbolName(payload.previousSymbol);
  for (let i = 0; i < payload.symbols.length; i++) {
    const event = payload.symbols[i];
    const symbolHash = cleanupSymbolName(event.symbol);
    if (symbolHash) {
      statements.push(
        ...edgeIncrement({
          publicApiKey,
          manifestHash,
          from: previousSymbol,
          to: symbolHash,
          interaction: event.interaction ? 1 : 0,
          delayBucket: toBucket(event.delay),
          latencyBucket: toBucket(event.latency),
        }),
        routeIncrement({
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
  await db.batch(statements);
  return true;
}

/**
 * Validate one client error beacon and record it into an open insights DB.
 *
 * @internal
 */
export async function recordInsightsError(db: InsightsDb, beacon: unknown): Promise<boolean> {
  const error: InsightsError | null = parseInsightsError(beacon);
  if (!error) {
    return false;
  }
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

/**
 * What a build knows about one symbol, as in `q-manifest.json` or an optimizer segment.
 *
 * @internal
 */
export interface InsightsSymbolDetail {
  hash: string;
  displayName: string;
  origin: string;
  loc: readonly number[];
}

const SYMBOL_DETAIL_ROWS_PER_STATEMENT = 100;

const isSymbolDetail = (symbol: InsightsSymbolDetail) =>
  typeof symbol?.hash === 'string' &&
  typeof symbol.displayName === 'string' &&
  typeof symbol.origin === 'string' &&
  Number.isInteger(symbol.loc?.[0]) &&
  Number.isInteger(symbol.loc?.[1]);

/**
 * Record a build's symbol names and source locations, which reports use to show readable names and
 * source previews. Re-recording a build updates its rows.
 *
 * @internal
 */
export async function recordInsightsSymbols(
  db: InsightsDb,
  publicApiKey: string,
  manifestHash: string,
  symbols: InsightsSymbolDetail[],
  { registerApplication = false }: RecordInsightsOptions = {}
): Promise<void> {
  const statements: InsightsStatement[] = registerApplication
    ? [applicationInsert(publicApiKey)]
    : [];
  statements.push(manifestInsert(publicApiKey, manifestHash));
  const validSymbols = symbols.filter(isSymbolDetail);
  for (let start = 0; start < validSymbols.length; start += SYMBOL_DETAIL_ROWS_PER_STATEMENT) {
    const chunk = validSymbols.slice(start, start + SYMBOL_DETAIL_ROWS_PER_STATEMENT);
    statements.push({
      sql: `INSERT INTO symbolDetail (hash, public_api_key, manifest_hash, full_name, origin, lo, hi)
        VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')}
        ON CONFLICT (public_api_key, manifest_hash, hash) DO UPDATE SET
          full_name = excluded.full_name, origin = excluded.origin, lo = excluded.lo, hi = excluded.hi`,
      args: chunk.flatMap((symbol) => [
        symbol.hash,
        publicApiKey,
        manifestHash,
        symbol.displayName,
        symbol.origin,
        symbol.loc[0],
        symbol.loc[1],
      ]),
    });
  }
  await db.batch(statements);
}

/**
 * Open (and migrate) a DB, then record a build's symbol details into it.
 *
 * @internal
 */
export async function writeInsightsSymbols(
  dbUrl: string,
  publicApiKey: string,
  manifestHash: string,
  symbols: InsightsSymbolDetail[],
  authToken?: string
): Promise<void> {
  const db = await getDb(dbUrl, authToken);
  await recordInsightsSymbols(db, publicApiKey, manifestHash, symbols, {
    registerApplication: true,
  });
}

/**
 * Write one insights beacon into a libSQL/SQLite database, creating the schema on first use. The
 * URL scheme selects the backend — local `file:` (node:sqlite) or remote Turso (`@libsql/client`).
 *
 * The payload is validated first (types and size limits), so it may come straight from a request.
 * Resolves to whether the beacon was recorded.
 *
 * @beta
 */
export async function writeInsights(
  dbUrl: string,
  beacon: InsightsPayload,
  authToken?: string
): Promise<boolean> {
  if (!parseInsightsPayload(beacon)) {
    return false;
  }
  const db = await getDb(dbUrl, authToken);
  return recordInsightsBeacon(db, beacon, { registerApplication: true });
}

/** Record one client error beacon, ignoring other apps' errors when `expectedKey` is set. */
async function writeInsightsError(
  dbUrl: string,
  beacon: unknown,
  expectedKey: string | undefined,
  authToken: string | undefined
): Promise<boolean> {
  const error = parseInsightsError(beacon);
  if (!error || (expectedKey && error.publicApiKey !== expectedKey)) {
    return false;
  }
  return recordInsightsError(await getDb(dbUrl, authToken), error);
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
  return dbUrl || readInsightsEnv('QWIK_INSIGHTS_DB_URL') || 'file:.qwik/insights.db';
}

/**
 * Read an insights beacon from a request and record it. Never throws — a metrics beacon must not
 * break the response — and resolves to whether the beacon was recorded. The endpoint is public, so
 * pass `publicApiKey` to only accept your own app's beacons. Client errors arrive at
 * `${postUrl}error/`, so mount it as a catch-all route, e.g.
 * `src/routes/insights-collect/[...path]/index.ts`. On runtimes without `process.env` (e.g.
 * Cloudflare), pass `dbUrl` and `authToken` read from the request's `env`.
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
  opts: { dbUrl?: string; authToken?: string; publicApiKey?: string } = {}
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
      return await writeInsightsError(dbUrl, beacon, opts.publicApiKey, opts.authToken);
    }
    return await writeInsights(dbUrl, beacon, opts.authToken);
  } catch (error) {
    warnOnce(`failed to record a beacon into ${redactInsightsDbUrl(dbUrl)}`, error);
    return false;
  }
}
