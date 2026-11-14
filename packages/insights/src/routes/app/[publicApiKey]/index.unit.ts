import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { expect, test, vi } from 'vitest';
import { initializeDbIfNeeded, type AppDatabase } from '~/db';

vi.mock('@qwik.dev/router', () => ({
  routeLoader$: (loader: unknown) => loader,
  routeLoaderQrl: (loader: unknown) => loader,
  Link: () => null,
  useLocation: vi.fn(),
}));
vi.mock('./layout', () => ({ useApplication: vi.fn() }));
vi.mock('~/db/query', () => ({
  getSlowEdges: vi.fn().mockResolvedValue([]),
  getSymbolDetails: vi.fn().mockResolvedValue([]),
}));
vi.mock('~/db/sql-manifest', () => ({
  dbGetManifestStats: vi.fn().mockResolvedValue([]),
}));

test('loads dashboard analytics without requesting application details again', async () => {
  (globalThis as any).__EXPERIMENTAL__ = {};
  const { useAppData } = await import('./index');
  const client = createClient({ url: 'file::memory:' });
  try {
    await client.execute(
      'CREATE TABLE errors (public_api_key TEXT, message TEXT, timestamp INTEGER)'
    );
    await initializeDbIfNeeded(async () => drizzle(client) as AppDatabase);
    const resolveValue = vi.fn().mockResolvedValue({ name: 'Current application' });
    const request = { params: { publicApiKey: 'app-a' }, resolveValue };
    const runLoader = useAppData as unknown as (
      event: typeof request
    ) => Promise<Record<string, unknown>>;

    const analytics = await runLoader(request);

    expect(resolveValue).not.toHaveBeenCalled();
    expect(analytics).toEqual({
      latest: null,
      previous: null,
      change: null,
      slowSymbols: [],
      errors: [],
    });
  } finally {
    client.close();
  }
});
