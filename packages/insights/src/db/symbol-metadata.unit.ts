import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { expect, test } from 'vitest';
import type { AppDatabase } from '.';
import { saveSymbolMetadata } from './symbol-metadata';

test('repeated and concurrent uploads keep one updated row per application, build, and symbol', async () => {
  const client = createClient({ url: 'file::memory:' });
  try {
    await client.batch([
      'CREATE TABLE symbolDetail (id INTEGER PRIMARY KEY, hash TEXT, public_api_key TEXT, manifest_hash TEXT, full_name TEXT, origin TEXT, lo INTEGER, hi INTEGER)',
      'CREATE UNIQUE INDEX symbol_identity ON symbolDetail(public_api_key, manifest_hash, hash)',
    ]);
    const db = drizzle(client) as AppDatabase;
    const symbols = Array.from({ length: 1001 }, (_, i) => ({
      hash: `hash-${i}`,
      fullName: `Symbol ${i}`,
      origin: 'source.tsx',
      lo: 1,
      hi: 2,
    }));
    await saveSymbolMetadata(db, 'app', 'build', symbols);
    symbols[1000].fullName = 'Updated tail';
    await Promise.all([
      saveSymbolMetadata(db, 'app', 'build', symbols),
      saveSymbolMetadata(db, 'app', 'build', symbols),
      saveSymbolMetadata(db, 'other', 'build', symbols.slice(1000)),
      saveSymbolMetadata(db, 'app', 'old', symbols.slice(1000)),
    ]);
    const rows = await client.execute(
      "SELECT * FROM symbolDetail WHERE public_api_key='app' AND manifest_hash='build'"
    );
    expect(rows.rows).toHaveLength(1001);
    expect(rows.rows.find((row) => row.hash === 'hash-1000')?.full_name).toBe('Updated tail');
    expect((await client.execute('SELECT count(*) AS count FROM symbolDetail')).rows[0].count).toBe(
      1003
    );
    await saveSymbolMetadata(db, 'app', 'build', []);
  } finally {
    client.close();
  }
});
