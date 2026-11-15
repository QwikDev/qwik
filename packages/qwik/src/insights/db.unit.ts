import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, vi } from 'vitest';
import {
  describeInsightsDbError,
  isRemoteInsightsUrl,
  localInsightsDbPath,
  openLibsql,
  openNodeSqlite,
  type InsightsDb,
} from './db';

const tmpPath = () => join(mkdtempSync(join(tmpdir(), 'qwik-db-')), 'x.db');

test('isRemoteInsightsUrl distinguishes local files from remote Turso', () => {
  expect(isRemoteInsightsUrl('file:/a/b.db')).toBe(false);
  expect(isRemoteInsightsUrl('/a/b.db')).toBe(false);
  expect(isRemoteInsightsUrl('libsql://x.turso.io')).toBe(true);
  expect(isRemoteInsightsUrl('https://x.turso.io')).toBe(true);
});

test('localInsightsDbPath strips every file: form and rejects remote URLs', () => {
  expect(localInsightsDbPath('file:.qwik/insights.db')).toBe('.qwik/insights.db');
  expect(localInsightsDbPath('file:/a/b.db')).toBe('/a/b.db');
  expect(normalize(localInsightsDbPath(pathToFileURL('/a b/c.db').href)!)).toBe(
    resolve('/a b/c.db')
  );
  expect(localInsightsDbPath('file://localhost/a%20b/c.db')).toBe('/a b/c.db');
  expect(localInsightsDbPath('/a/b.db')).toBe('/a/b.db');
  expect(localInsightsDbPath('libsql://x.turso.io')).toBeNull();
});

// Both backends must implement the same exec/batch/all contract (node:sqlite; @libsql via a file: URL).
test.each<[string, (p: string) => Promise<InsightsDb>]>([
  ['node:sqlite', (p) => openNodeSqlite(p)],
  ['@libsql/client', (p) => openLibsql('file:' + p)],
])('%s backend runs exec/batch/all, rolling back a failed batch', async (_name, open) => {
  const db = await open(tmpPath());
  await db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT);');

  await db.batch([
    { sql: 'INSERT INTO t (id, name) VALUES (?, ?)', args: [1, 'a'] },
    { sql: 'UPDATE t SET name = ? WHERE id = ?', args: ['b', 1] },
  ]);
  expect(await db.all('SELECT id, name FROM t')).toEqual([{ id: 1, name: 'b' }]);

  // The duplicate key fails the second statement, so the first must not stick either.
  await expect(
    db.batch([
      { sql: 'INSERT INTO t (id, name) VALUES (?, ?)', args: [2, 'c'] },
      { sql: 'INSERT INTO t (id, name) VALUES (?, ?)', args: [1, 'dup'] },
    ])
  ).rejects.toThrow();
  expect(await db.all('SELECT id FROM t WHERE id = ?', [2])).toEqual([]);

  db.close();
});

test('local files fall back to @libsql/client without node:sqlite (Node < 22.5)', async () => {
  vi.resetModules();
  vi.doMock('node:sqlite', () => {
    throw new Error('No such built-in module: node:sqlite');
  });
  try {
    const { openInsightsDb } = await import('./db');
    // `#` and `?` are valid in filenames but not in a raw file: URL.
    const dir = mkdtempSync(join(tmpdir(), 'qwik#db?-'));
    const db = await openInsightsDb('file:' + join(dir, 'x.db'));
    await db.exec('CREATE TABLE t (id INTEGER);');
    await db.batch([{ sql: 'INSERT INTO t (id) VALUES (?)', args: [1] }]);
    expect(await db.all('SELECT id FROM t')).toEqual([{ id: 1 }]);
    db.close();
  } finally {
    vi.doUnmock('node:sqlite');
    vi.resetModules();
  }
});

test('describeInsightsDbError redacts a token the error echoes', () => {
  const error = new Error('cannot reach libsql://db.turso.io?authToken=secret123');
  const described = describeInsightsDbError(error);
  expect(described).toContain('authToken=***');
  expect(described).not.toContain('secret123');
});

test('describeInsightsDbError redacts a token whose name is percent-encoded', () => {
  // libSQL decodes parameter names, so `auth%54oken` still carries the token.
  const described = describeInsightsDbError('libsql://db.turso.io?tls=1&auth%54oken=secret123');
  expect(described).toContain('tls=1');
  expect(described).not.toContain('secret123');
});
