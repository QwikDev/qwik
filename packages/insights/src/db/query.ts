import { and, eq, not, sql } from 'drizzle-orm';
import { type AppDatabase } from '.';
import { applicationTable, symbolDetailTable, symbolTable } from './schema';

export function getSymbolEdges(db: AppDatabase, publicApiKey: string) {
  return db
    .select({
      from: symbolTable.previousSymbol,
      to: symbolTable.symbol,
      latency: symbolTable.loadDelay,
      delay: symbolTable.timeDelta,
    })
    .from(symbolTable)
    .where(and(eq(symbolTable.publicApiKey, publicApiKey), not(eq(symbolTable.symbol, '_hW'))))
    .all();
}

export function getSymbolDetails(db: AppDatabase, publicApiKey: string) {
  return db
    .select({
      hash: symbolDetailTable.hash,
      fullName: symbolDetailTable.fullName,
      origin: symbolDetailTable.origin,
    })
    .from(symbolDetailTable)
    .where(eq(symbolDetailTable.publicApiKey, publicApiKey))
    .all();
}

export function getAppInfo(
  db: AppDatabase,
  publicApiKey: string
): Promise<{ id: number; name: string; description: string | null; publicApiKey: string }> {
  return db
    .select()
    .from(applicationTable)
    .where(eq(applicationTable.publicApiKey, publicApiKey))
    .get();
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
