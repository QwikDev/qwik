import { sql } from 'drizzle-orm';
import type { AppDatabase } from '.';
import { symbolDetailTable, type SymbolDetailRow } from './schema';

type SymbolMetadata = Pick<SymbolDetailRow, 'hash' | 'fullName' | 'origin' | 'lo' | 'hi'>;

export async function saveSymbolMetadata(
  db: AppDatabase,
  publicApiKey: string,
  manifestHash: string,
  symbols: SymbolMetadata[]
) {
  for (let offset = 0; offset < symbols.length; offset += 100) {
    await db
      .insert(symbolDetailTable)
      .values(
        symbols.slice(offset, offset + 100).map((symbol) => ({
          ...symbol,
          publicApiKey,
          manifestHash,
        }))
      )
      .onConflictDoUpdate({
        target: [
          symbolDetailTable.publicApiKey,
          symbolDetailTable.manifestHash,
          symbolDetailTable.hash,
        ],
        set: {
          fullName: sql`excluded.full_name`,
          origin: sql`excluded.origin`,
          lo: sql`excluded.lo`,
          hi: sql`excluded.hi`,
        },
      })
      .run();
  }
}
