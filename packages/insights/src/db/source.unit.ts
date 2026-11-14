import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AppDatabase } from '.';
import { SourceSettings, sourceUrls } from '../source-repository';
import { getSourceSettings, loadSymbolSource, saveSourceSettings } from './source';

const client = createClient({ url: 'file::memory:' });
const db = drizzle(client) as AppDatabase;
afterEach(async () => {
  await client.execute('DROP TABLE IF EXISTS application_sources');
  await client.execute('DROP TABLE IF EXISTS symbolDetail');
});

async function setup() {
  await client.execute(
    'CREATE TABLE application_sources (public_api_key TEXT PRIMARY KEY, repository TEXT NOT NULL, revision TEXT NOT NULL, source_root TEXT NOT NULL)'
  );
  await client.execute(
    'CREATE TABLE symbolDetail (public_api_key TEXT, hash TEXT, full_name TEXT, origin TEXT, lo INTEGER, hi INTEGER)'
  );
}

const settings = {
  repository: 'https://github.com/example/site',
  revision: 'release/v2',
  sourceRoot: 'packages/web/src',
};

describe('application source settings', () => {
  test('saves, updates and disables source for only the selected application', async () => {
    await setup();
    await saveSourceSettings(db, 'app-a', settings);
    await saveSourceSettings(db, 'app-b', { ...settings, revision: 'other' });
    await saveSourceSettings(db, 'app-a', { ...settings, revision: 'v1' });
    expect(await getSourceSettings(db, 'app-a')).toMatchObject({ revision: 'v1' });
    expect(await getSourceSettings(db, 'app-b')).toMatchObject({ revision: 'other' });
    await saveSourceSettings(db, 'app-a', { ...settings, repository: '' });
    expect(await getSourceSettings(db, 'app-a')).toBeUndefined();
    expect(await getSourceSettings(db, 'app-b')).toMatchObject({ revision: 'other' });
  });

  test('loads source using the selected app repository and symbol metadata', async () => {
    await setup();
    await saveSourceSettings(db, 'app-a', settings);
    await client.batch([
      "INSERT INTO symbolDetail VALUES ('app-a', 'hash', 'Button', './button.tsx', 1, 6)",
      "INSERT INTO symbolDetail VALUES ('app-b', 'hash', 'Other', 'private.tsx', 1, 2)",
    ]);
    const fetchSource = vi.fn().mockResolvedValue(new Response('hello world\n'));
    const result = await loadSymbolSource(db, 'app-a', 'hash', fetchSource);
    expect(fetchSource).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/example/site/release%2Fv2/packages/web/src/button.tsx',
      expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) })
    );
    expect(result).toMatchObject({ fullName: 'Button', source: { highlight: 'hello' } });
    expect(result.originUrl).toContain('https://github.com/example/site/blob/release%2Fv2/');
  });

  test('keeps metadata and explains unconfigured repositories and unavailable files', async () => {
    await setup();
    await client.execute(
      "INSERT INTO symbolDetail VALUES ('app-a', 'hash', 'Button', 'button.tsx', 1, 6)"
    );
    const fetchSource = vi.fn();
    expect(await loadSymbolSource(db, 'app-a', 'hash', fetchSource)).toMatchObject({
      fullName: 'Button',
      source: null,
      status: 'unconfigured',
    });
    expect(fetchSource).not.toHaveBeenCalled();
    await saveSourceSettings(db, 'app-a', settings);
    fetchSource.mockResolvedValue(new Response('', { status: 404 }));
    expect(await loadSymbolSource(db, 'app-a', 'hash', fetchSource)).toMatchObject({
      fullName: 'Button',
      source: null,
      status: 'unavailable',
    });
    expect(await loadSymbolSource(db, 'app-b', 'hash', fetchSource)).toMatchObject({
      source: null,
      status: 'missing-metadata',
    });
  });
});

describe('GitHub source URLs', () => {
  test('saves and encodes release tags containing a plus sign', async () => {
    await setup();
    const releaseSettings = { ...settings, revision: 'v1.0.0+build.1' };
    await saveSourceSettings(db, 'app-a', releaseSettings);
    const savedSettings = await getSourceSettings(db, 'app-a');
    expect(savedSettings).toEqual(releaseSettings);
    expect(sourceUrls(savedSettings!, 'button.tsx')).toEqual({
      raw: 'https://raw.githubusercontent.com/example/site/v1.0.0%2Bbuild.1/packages/web/src/button.tsx',
      browser: 'https://github.com/example/site/blob/v1.0.0%2Bbuild.1/packages/web/src/button.tsx',
    });
  });

  test('accepts public GitHub repositories and normalizes source directories', () => {
    const parsed = SourceSettings.parse({
      ...settings,
      repository: settings.repository + '.git/',
      sourceRoot: './packages/web/src/',
    });
    expect(parsed).toEqual(settings);
    expect(sourceUrls(parsed, './routes/[id]/index.tsx')?.raw).toContain(
      '/routes/%5Bid%5D/index.tsx'
    );
  });

  test.each([
    'https://evil.example/a/b',
    'http://github.com/a/b',
    'https://github.com@evil.example/a/b',
    'https://github.com/a/b/tree/main',
  ])('rejects an unsupported repository: %s', (repository) => {
    expect(SourceSettings.safeParse({ ...settings, repository }).success).toBe(false);
  });

  test.each([
    '../secret',
    '/etc/passwd',
    'https://evil.example/file',
    '%2e%2e/secret',
    'dir/../../secret',
    'dir\\file',
  ])('rejects unsafe source paths: %s', (path) => {
    expect(sourceUrls(settings, path)).toBeNull();
    expect(SourceSettings.safeParse({ ...settings, sourceRoot: path }).success).toBe(false);
  });

  test.each(['../main', 'main?x=1', 'main#secret', 'main%2f..', ''])(
    'rejects unsafe or empty revisions: %s',
    (revision) => {
      expect(SourceSettings.safeParse({ ...settings, revision }).success).toBe(false);
    }
  );
});

describe('source download failures', () => {
  test('does not expose a fetch failure or follow redirects', async () => {
    const { fetchSourceText } = await import('./source');
    const fetchSource = vi.fn().mockRejectedValue(new Error('network failure'));
    expect(
      await fetchSourceText(
        'https://raw.githubusercontent.com/example/site/main/file.ts',
        fetchSource
      )
    ).toBeNull();
    expect(fetchSource).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) })
    );
  });

  test('limits downloaded source to one megabyte', async () => {
    const { fetchSourceText } = await import('./source');
    const fetchSource = vi.fn().mockResolvedValue(new Response('x'.repeat(1_048_577)));
    expect(
      await fetchSourceText(
        'https://raw.githubusercontent.com/example/site/main/file.ts',
        fetchSource
      )
    ).toBeNull();
  });
});

test('the additive migration preserves the existing Qwik mapping without changing other apps', async () => {
  const { readFile } = await import('node:fs/promises');
  await client.execute('CREATE TABLE applications (public_api_key TEXT PRIMARY KEY)');
  try {
    await client.batch([
      "INSERT INTO applications VALUES ('221smyuj5gl')",
      "INSERT INTO applications VALUES ('app-b')",
    ]);
    const migration = await readFile(
      new URL('../../drizzle/0020_application_source.sql', import.meta.url),
      'utf8'
    );
    await client.batch(
      migration
        .split('--> statement-breakpoint')
        .map((sql) => sql.trim())
        .filter(Boolean)
    );
    expect(await getSourceSettings(db, '221smyuj5gl')).toEqual({
      repository: 'https://github.com/QwikDev/qwik',
      revision: 'main',
      sourceRoot: 'packages/docs/src',
    });
    expect(await getSourceSettings(db, 'app-b')).toBeUndefined();
  } finally {
    await client.execute('DROP TABLE application_sources');
    await client.execute('DROP TABLE applications');
  }
});

test('uses source metadata from the selected build without falling back to another build', async () => {
  await setup();
  await client.execute('ALTER TABLE symbolDetail ADD COLUMN manifest_hash TEXT');
  await client.batch([
    "INSERT INTO symbolDetail VALUES ('app-a', 'hash', 'Old', 'old.tsx', 1, 6, 'old')",
    "INSERT INTO symbolDetail VALUES ('app-a', 'hash', 'New', 'new.tsx', 1, 6, 'new')",
  ]);
  await saveSourceSettings(db, 'app-a', settings);
  const fetchSource = vi.fn().mockResolvedValue(new Response('hello'));
  expect(await loadSymbolSource(db, 'app-a', 'hash', fetchSource, 'new')).toMatchObject({
    fullName: 'New',
    origin: 'new.tsx',
  });
  expect(await loadSymbolSource(db, 'app-a', 'hash', fetchSource, 'missing')).toMatchObject({
    status: 'missing-metadata',
  });
});
