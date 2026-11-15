import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { expect, test, vi } from 'vitest';
import type { AppDatabase } from '.';
import { getIntegrationHealth, testSourceMapping } from './integration-health';

test('reports distinct observed metadata coverage within one application and build', async () => {
  const client = createClient({ url: 'file::memory:' });
  try {
    await client.batch([
      'CREATE TABLE manifests (public_api_key TEXT, hash TEXT, timestamp INTEGER)',
      "INSERT INTO manifests VALUES ('a','new',200),('a','new',100),('a','old',50),('b','new',10)",
      'CREATE TABLE edges (public_api_key TEXT, manifest_hash TEXT, "to" TEXT)',
      'CREATE TABLE routes (public_api_key TEXT, manifest_hash TEXT, route TEXT)',
      'CREATE TABLE symbolDetail (public_api_key TEXT, manifest_hash TEXT, hash TEXT, full_name TEXT, origin TEXT, lo INTEGER, hi INTEGER)',
      'CREATE TABLE application_sources (public_api_key TEXT, repository TEXT, revision TEXT, source_root TEXT)',
      "INSERT INTO edges VALUES ('a','new','one'),('a','new','one'),('a','new','two'),('a','old','old'),('b','new','private')",
      "INSERT INTO symbolDetail VALUES ('a','new','one','First','src/one.tsx',1,4),('a','old','two','Old','old.tsx',1,4),('b','new','two','Private','private.tsx',1,4)",
      "INSERT INTO routes VALUES ('a','new','/'),('a','new','/'),('b','new','/private')",
      "INSERT INTO application_sources VALUES ('a','https://github.com/example/repo','main','')",
    ]);
    const db = drizzle(client) as AppDatabase;
    expect(await getIntegrationHealth(db, 'a', 'new')).toMatchObject({
      firstSeen: new Date(100).toISOString(),
      observed: 2,
      mapped: 1,
      routes: 1,
      metadata: 1,
    });
    const fetchSource = vi.fn<typeof fetch>().mockResolvedValue(new Response('source code'));
    expect(await testSourceMapping(db, 'a', 'new', fetchSource)).toMatchObject({
      status: 'loaded',
      symbol: 'one',
      origin: 'src/one.tsx',
    });
    expect(fetchSource).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/example/repo/main/src/one.tsx',
      expect.any(Object)
    );
    fetchSource.mockClear();
    expect(await testSourceMapping(db, 'a', 'missing', fetchSource)).toMatchObject({
      status: 'missing-metadata',
    });
    expect(fetchSource).not.toHaveBeenCalled();
    expect(await getIntegrationHealth(db, 'a', null)).toMatchObject({
      firstSeen: null,
      observed: 0,
      mapped: 0,
      metadata: 0,
      routes: 0,
    });
  } finally {
    client.close();
  }
});
