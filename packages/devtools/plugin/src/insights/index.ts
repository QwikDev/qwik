import {
  type InsightsDb,
  localInsightsDbPath,
  openInsightsDb,
  redactInsightsDbUrl,
} from '@qwik.dev/core/insights/collector';
import type { InsightsDbData, InsightsEdgeRow, InsightsRouteRow } from '@qwik.dev/devtools/kit';
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { ServerContext } from '../types';

const TOP_ROWS = 100;

/** SQL that totals every histogram-bucket column of `table` sharing `prefix` (e.g. `delay_count_`). */
export async function bucketTotalSql(db: InsightsDb, table: string, prefix: string) {
  const columns = (await db.all(`PRAGMA table_info(${table})`))
    .map((column) => String(column.name))
    .filter((name) => name.startsWith(prefix));
  if (!columns.length) {
    return '0';
  }
  return columns.map((name) => `SUM("${name.replace(/"/g, '""')}")`).join(' + ');
}

/** A table may not exist yet on a fresh DB; treat that as "no rows" rather than an error. */
async function hasTable(db: InsightsDb, table: string): Promise<boolean> {
  const rows = await db.all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [
    table,
  ]);
  return rows.length > 0;
}

async function readTopEdges(db: InsightsDb): Promise<InsightsEdgeRow[]> {
  if (!(await hasTable(db, 'edges'))) {
    return [];
  }
  const total = await bucketTotalSql(db, 'edges', 'delay_count_');
  // Merged across builds; one row per app and edge.
  const rows = await db.all(
    `SELECT public_api_key, "from", "to", MAX(interaction) interaction, ${total} count
     FROM edges GROUP BY public_api_key, "from", "to" ORDER BY count DESC LIMIT ${TOP_ROWS}`
  );
  return rows.map((row) => ({
    publicApiKey: row.public_api_key,
    from: row.from,
    to: row.to,
    interaction: !!row.interaction,
    count: Number(row.count) || 0,
  }));
}

async function readTopRoutes(db: InsightsDb): Promise<InsightsRouteRow[]> {
  if (!(await hasTable(db, 'routes'))) {
    return [];
  }
  const total = await bucketTotalSql(db, 'routes', 'timeline_');
  const rows = await db.all(
    `SELECT public_api_key, route, symbol, ${total} count
     FROM routes GROUP BY public_api_key, route, symbol ORDER BY count DESC LIMIT ${TOP_ROWS}`
  );
  return rows.map((row) => ({
    publicApiKey: row.public_api_key,
    route: row.route,
    symbol: row.symbol,
    count: Number(row.count) || 0,
  }));
}

export function getInsightsFunctions({ config }: ServerContext) {
  return {
    getInsightsData: async (): Promise<InsightsDbData> => {
      const configuredUrl = process.env.QWIK_INSIGHTS_DB_URL;
      let url = configuredUrl || `file:${join(config.root, '.qwik', 'insights.db')}`;
      const data: InsightsDbData = {
        dbUrl: redactInsightsDbUrl(url),
        configured: !!configuredUrl,
        apps: [],
        edges: [],
        routes: [],
      };

      let dbPath = localInsightsDbPath(url);
      if (dbPath !== null) {
        if (!isAbsolute(dbPath)) {
          dbPath = join(config.root, dbPath);
        }
        if (!existsSync(dbPath)) {
          data.error = `No insights database at ${dbPath}. Set QWIK_INSIGHTS_DB_URL, or collect some sessions first.`;
          return data;
        }
        url = `file:${dbPath}`;
      }

      let db: InsightsDb | undefined;
      try {
        db = await openInsightsDb(url, process.env.QWIK_INSIGHTS_DB_AUTH_TOKEN);
        if (await hasTable(db, 'applications')) {
          data.apps = (await db.all('SELECT name, public_api_key, url FROM applications')).map(
            (row) => ({ name: row.name, publicApiKey: row.public_api_key, url: row.url })
          );
        }
        data.edges = await readTopEdges(db);
        data.routes = await readTopRoutes(db);
      } catch (e) {
        // libSQL errors can echo the URL, token included.
        data.error = redactInsightsDbUrl(e instanceof Error ? e.message : String(e));
      } finally {
        db?.close();
      }

      return data;
    },
  };
}
