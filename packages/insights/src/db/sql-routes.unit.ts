import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, assert, beforeEach, test } from 'vitest';
import type { AppDatabase } from '.';
import { getRoutes, getRouteTimeline } from './sql-routes';

let client: Client;
let db: AppDatabase;

const buckets = Array.from({ length: 50 }, (_, index) => index + 1);
const zeroBuckets = buckets.map(() => 0);
const lastBucket = buckets.map((_, index) => (index === 49 ? 10_000 : 0));

beforeEach(async () => {
  client = createClient({ url: 'file::memory:' });
  db = drizzle(client) as AppDatabase;
  const columns = buckets.map((_, index) => `timeline_${String(index).padStart(2, '0')}`);
  await client.execute(
    `CREATE TABLE routes (public_api_key TEXT NOT NULL, manifest_hash TEXT NOT NULL, route TEXT NOT NULL, symbol TEXT NOT NULL, ${columns.map((column) => `${column} INTEGER NOT NULL`).join(',')})`
  );
  await client.batch(
    [
      ['app', 'current', '/alpha', 'shared', ...buckets],
      ['app', 'previous', '/alpha', 'shared', ...buckets.map((count) => count * 2)],
      ['app', 'excluded', '/alpha', 'shared', ...buckets.map((count) => count * 4)],
      ['other-app', 'current', '/alpha', 'shared', ...buckets.map(() => 100_000)],
      ['app', 'current', '/alpha', 'busy', ...lastBucket],
      ['app', 'current', '/alpha', 'empty', ...zeroBuckets],
      ['app', 'current', '/zeta', 'shared', ...buckets],
    ].map((args) => ({
      sql: `INSERT INTO routes (public_api_key, manifest_hash, route, symbol, ${columns.join(',')}) VALUES (${args.map(() => '?').join(',')})`,
      args,
    }))
  );
});

afterEach(() => {
  client.close();
});

test('returns all 50 summed buckets for the selected application and manifests', async () => {
  assert.deepEqual(await getRoutes(db, 'app', ['current', 'previous']), [
    { route: '/alpha', symbol: 'busy', timeline: lastBucket },
    { route: '/alpha', symbol: 'shared', timeline: buckets.map((count) => count * 3) },
    { route: '/alpha', symbol: 'empty', timeline: zeroBuckets },
    { route: '/zeta', symbol: 'shared', timeline: buckets },
  ]);
});

test('returns only the requested route with symbols ordered by total samples', async () => {
  assert.deepEqual(await getRouteTimeline(db, 'app', '/alpha', ['current', 'previous']), [
    { route: '/alpha', symbol: 'busy', timeline: lastBucket },
    { route: '/alpha', symbol: 'shared', timeline: buckets.map((count) => count * 3) },
    { route: '/alpha', symbol: 'empty', timeline: zeroBuckets },
  ]);
});

test.each([undefined, []])('includes every manifest when the filter is %j', async (manifests) => {
  const expected = [
    { route: '/alpha', symbol: 'busy', timeline: lastBucket },
    { route: '/alpha', symbol: 'shared', timeline: buckets.map((count) => count * 7) },
    { route: '/alpha', symbol: 'empty', timeline: zeroBuckets },
  ];
  assert.deepEqual(await getRouteTimeline(db, 'app', '/alpha', manifests), expected);
  assert.deepEqual(await getRoutes(db, 'app', manifests), [
    ...expected,
    { route: '/zeta', symbol: 'shared', timeline: buckets },
  ]);
});

test('returns no timelines when the application, manifest, or route has no samples', async () => {
  assert.deepEqual(await getRoutes(db, 'missing-app', undefined), []);
  assert.deepEqual(await getRoutes(db, 'app', ['missing-manifest']), []);
  assert.deepEqual(await getRouteTimeline(db, 'missing-app', '/alpha', undefined), []);
  assert.deepEqual(await getRouteTimeline(db, 'app', '/alpha', ['missing-manifest']), []);
  assert.deepEqual(await getRouteTimeline(db, 'app', '/missing', undefined), []);
});
