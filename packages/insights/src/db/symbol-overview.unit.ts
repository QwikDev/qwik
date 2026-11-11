import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { expect, test } from 'vitest';
import type { AppDatabase } from '.';
import { getSymbolOverview } from './symbol-overview';

test('reads only the requested symbol, application, and builds', async () => {
  const client = createClient({ url: 'file::memory:' });
  try {
    const columns = Array.from(
      { length: 50 },
      (_, i) => `latency_count_${String(i).padStart(2, '0')} INTEGER DEFAULT 0`
    ).join(',');
    await client.batch([
      `CREATE TABLE edges (public_api_key TEXT, manifest_hash TEXT, "to" TEXT, ${columns})`,
      'CREATE TABLE routes (public_api_key TEXT, manifest_hash TEXT, route TEXT, symbol TEXT)',
      'CREATE TABLE symbolDetail (public_api_key TEXT, manifest_hash TEXT, hash TEXT, full_name TEXT, origin TEXT)',
      "INSERT INTO edges(public_api_key,manifest_hash,\"to\",latency_count_00) VALUES ('a','new','checkout',100),('a','old','checkout',200),('b','new','checkout',999),('a','new','other',999)",
      "INSERT INTO routes VALUES ('a','new','/checkout','checkout'),('b','new','/private','checkout'),('a','old','/old','checkout')",
      "INSERT INTO symbolDetail VALUES ('a','old','checkout','Old checkout','old.tsx'),('a','new','checkout','Checkout','checkout.tsx'),('b','new','checkout','Private','private.tsx')",
    ]);
    const overview = await getSymbolOverview(
      drizzle(client) as AppDatabase,
      'a',
      'checkout',
      'new',
      'old'
    );
    expect(overview.comparison).toMatchObject({ samples: 100, previousSamples: 200 });
    expect(overview.routes).toEqual(['/checkout']);
    expect(overview.metadata).toEqual({ fullName: 'Checkout', origin: 'checkout.tsx' });
    const empty = await getSymbolOverview(
      drizzle(client) as AppDatabase,
      'a',
      'checkout',
      null,
      null
    );
    expect(empty.comparison.samples).toBe(0);
    expect(empty.routes).toEqual([]);
    const missing = await getSymbolOverview(
      drizzle(client) as AppDatabase,
      'a',
      'missing',
      'new',
      'old'
    );
    expect(missing.comparison).toMatchObject({
      samples: 0,
      previousSamples: 0,
      p95: null,
      change: null,
    });
  } finally {
    client.close();
  }
});
