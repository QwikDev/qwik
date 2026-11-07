import type { InsightsDbData, InsightsEdgeRow, InsightsRouteRow } from '@qwik.dev/devtools/kit';
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { ServerContext } from '../types';

/** Sum every histogram-bucket column sharing a prefix (e.g. `delay_count_`) into one total. */
export function sumBuckets(row: Record<string, unknown>, prefix: string): number {
  let total = 0;
  for (const key in row) {
    if (key.startsWith(prefix)) {
      total += Number(row[key]) || 0;
    }
  }
  return total;
}

/** Hide any auth token before the URL is shown in the UI. */
export function redactDbUrl(url: string): string {
  return url.replace(/(authToken|token)=[^&]*/gi, '$1=***');
}

const REMOTE_URL = /^(libsql|wss?|https?):\/\//i;

interface ReadDb {
  all(sql: string): Promise<Record<string, any>[]>;
  close(): void;
}

/** Open a read-only connection: local files via node:sqlite, remote Turso via @libsql/client. */
async function openReadDb(url: string, authToken?: string): Promise<ReadDb> {
  if (REMOTE_URL.test(url)) {
    let createClient;
    try {
      ({ createClient } = await import('@libsql/client'));
    } catch {
      throw new Error(
        'Remote Turso URLs need the optional "@libsql/client" package. Install it, or point QWIK_INSIGHTS_DB_URL at a local file.'
      );
    }
    const client = createClient({
      url,
      intMode: 'number',
      ...(authToken ? { authToken } : {}),
    });
    return {
      all: async (sql) => {
        const result = await client.execute(sql);
        return result.rows.map((row) => {
          const record: Record<string, any> = {};
          for (const column of result.columns) {
            record[column] = (row as any)[column];
          }
          return record;
        });
      },
      close: () => client.close(),
    };
  }

  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(url.replace(/^file:/, ''), { readOnly: true });
  return {
    all: async (sql) => db.prepare(sql).all() as Record<string, any>[],
    close: () => db.close(),
  };
}

export function getInsightsFunctions({ config }: ServerContext) {
  return {
    getInsightsData: async (): Promise<InsightsDbData> => {
      const configuredUrl = process.env.QWIK_INSIGHTS_DB_URL;
      let url = configuredUrl || `file:${join(config.root, '.qwik', 'insights.db')}`;
      const data: InsightsDbData = {
        dbUrl: redactDbUrl(url),
        configured: !!configuredUrl,
        apps: [],
        edges: [],
        routes: [],
      };

      if (!REMOTE_URL.test(url)) {
        let dbPath = url.replace(/^file:/, '');
        if (!isAbsolute(dbPath)) {
          dbPath = join(config.root, dbPath);
        }
        if (!existsSync(dbPath)) {
          data.error = `No insights database at ${dbPath}. Set QWIK_INSIGHTS_DB_URL, or collect some sessions first.`;
          return data;
        }
        url = `file:${dbPath}`;
      }

      let db: ReadDb | undefined;
      try {
        db = await openReadDb(url, process.env.QWIK_INSIGHTS_DB_AUTH_TOKEN);

        // A table may not exist yet on a fresh DB; treat that as "no rows" rather than an error.
        const readTable = async <T>(sql: string, map: (row: any) => T): Promise<T[]> => {
          try {
            return (await db!.all(sql)).map(map);
          } catch {
            return [];
          }
        };

        data.apps = await readTable('SELECT name, public_api_key, url FROM applications', (r) => ({
          name: r.name,
          publicApiKey: r.public_api_key,
          url: r.url,
        }));

        // ponytail: fetch a page and rank in JS. Add SQL SUM+ORDER BY if a dev DB ever exceeds this.
        data.edges = (
          await readTable(
            'SELECT * FROM edges LIMIT 1000',
            (r): InsightsEdgeRow => ({
              from: r.from,
              to: r.to,
              interaction: !!r.interaction,
              count: sumBuckets(r, 'delay_count_'),
            })
          )
        )
          .sort((a, b) => b.count - a.count)
          .slice(0, 100);

        data.routes = (
          await readTable(
            'SELECT * FROM routes LIMIT 1000',
            (r): InsightsRouteRow => ({
              route: r.route,
              symbol: r.symbol,
              count: sumBuckets(r, 'timeline_'),
            })
          )
        )
          .sort((a, b) => b.count - a.count)
          .slice(0, 100);
      } catch (e) {
        data.error = e instanceof Error ? e.message : String(e);
      } finally {
        db?.close();
      }

      return data;
    },
  };
}
