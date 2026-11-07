import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { isRemoteInsightsUrl, openLibsql, openNodeSqlite, type InsightsDb } from './db';

const tmpPath = () => join(mkdtempSync(join(tmpdir(), 'qwik-db-')), 'x.db');

test('isRemoteInsightsUrl distinguishes local files from remote Turso', () => {
  expect(isRemoteInsightsUrl('file:/a/b.db')).toBe(false);
  expect(isRemoteInsightsUrl('/a/b.db')).toBe(false);
  expect(isRemoteInsightsUrl('libsql://x.turso.io')).toBe(true);
  expect(isRemoteInsightsUrl('https://x.turso.io')).toBe(true);
});

// Both backends must implement the same exec/run/all contract (node:sqlite; @libsql via a file: URL).
test.each<[string, (p: string) => Promise<InsightsDb>]>([
  ['node:sqlite', (p) => openNodeSqlite(p)],
  ['@libsql/client', (p) => openLibsql('file:' + p)],
])('%s backend runs exec/run/all with a changes count', async (_name, open) => {
  const db = await open(tmpPath());
  await db.exec('CREATE TABLE t (id INTEGER, name TEXT);');

  expect((await db.run('INSERT INTO t (id, name) VALUES (?, ?)', [1, 'a'])).changes).toBe(1);
  expect((await db.run('UPDATE t SET name = ? WHERE id = ?', ['b', 1])).changes).toBe(1);
  expect((await db.run('UPDATE t SET name = ? WHERE id = ?', ['b', 99])).changes).toBe(0);
  expect(await db.all('SELECT id, name FROM t')).toEqual([{ id: 1, name: 'b' }]);

  db.close();
});
