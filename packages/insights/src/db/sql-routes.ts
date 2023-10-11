import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { routesTable, type AppDatabase } from '.';
import { listToVector, sumTimelineCount, timelineDelayAsList } from './query-helpers';
import { time } from './logging';

export interface RouteSymbolRow {
  route: string;
  symbol: string;
  timeline: number[];
}

export async function getRoutes(
  db: AppDatabase,
  publicApiKey: string,
  manifests: string[] | undefined
): Promise<RouteSymbolRow[]> {
  let where = eq(routesTable.publicApiKey, publicApiKey);
  if (manifests && manifests.length) {
    where = and(where, inArray(routesTable.manifestHash, manifests))!;
  }

  return time('routesTable.getRoutes', async () => {
    const query = await db
      .select({
        route: routesTable.route,
        symbol: routesTable.symbol,
        timelineDelays: timelineDelayAsList,
      })
      .from(routesTable)
      .where(where)
      .groupBy(routesTable.route, routesTable.symbol)
      .orderBy(sql`${routesTable.route}`, desc(sumTimelineCount))
      .all();
    return query.map((row) => ({
      route: row.route,
      symbol: row.symbol,
      timeline: listToVector(row.timelineDelays),
    }));
  });
}
