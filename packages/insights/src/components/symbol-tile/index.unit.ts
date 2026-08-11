import { describe, expect, test, vi } from 'vitest';
import type { RequestEvent } from '@qwik.dev/router';
import { InsightsUser } from '~/db/sql-user';

vi.mock('@qwik.dev/router', () => ({
  getRequestEvent: vi.fn(),
  server$: (serverFunction: unknown) => serverFunction,
  serverQrl: vi.fn(),
  useLocation: vi.fn(),
}));

describe('symbol source tenant authorization', () => {
  test('rejects a request without an authenticated Insights user', async () => {
    (globalThis as any).__EXPERIMENTAL__ = {};
    const { getAuthorizedPublicApiKey } = await import('./index');
    const forbidden = new Error('Forbidden');
    const error = vi.fn(() => forbidden);

    await expect(
      getAuthorizedPublicApiKey({
        params: { publicApiKey: 'app-a' },
        sharedMap: new Map(),
        error: error as unknown as RequestEvent['error'],
      })
    ).rejects.toBe(forbidden);
  });

  test('rejects a tenant that the current user cannot access', async () => {
    (globalThis as any).__EXPERIMENTAL__ = {};
    const { getAuthorizedPublicApiKey } = await import('./index');
    const forbidden = new Error('Forbidden');
    const error = vi.fn(() => forbidden);

    await expect(
      getAuthorizedPublicApiKey({
        params: { publicApiKey: 'app-b' },
        sharedMap: new Map([
          ['insightUser', new InsightsUser(1, 'john@example.com', false, ['app-a'])],
        ]),
        error: error as unknown as RequestEvent['error'],
      })
    ).rejects.toBe(forbidden);
    expect(error).toHaveBeenCalledWith(403, 'Forbidden');
  });

  test('uses the route tenant when the current user can access it', async () => {
    (globalThis as any).__EXPERIMENTAL__ = {};
    const { getAuthorizedPublicApiKey } = await import('./index');

    await expect(
      getAuthorizedPublicApiKey({
        params: { publicApiKey: 'app-a' },
        sharedMap: new Map([
          ['insightUser', new InsightsUser(1, 'john@example.com', false, ['app-a'])],
        ]),
        error: vi.fn() as RequestEvent['error'],
      })
    ).resolves.toBe('app-a');
  });

  test('authorizes the explicit app key when server requests have no route params', async () => {
    (globalThis as any).__EXPERIMENTAL__ = {};
    const { getAuthorizedPublicApiKey } = await import('./index');

    await expect(
      getAuthorizedPublicApiKey(
        {
          params: {},
          sharedMap: new Map([
            ['insightUser', new InsightsUser(1, 'john@example.com', false, ['app-a'])],
          ]),
          error: vi.fn() as RequestEvent['error'],
        },
        'app-a'
      )
    ).resolves.toBe('app-a');
  });

  test('loads permissions from the authenticated session for server function requests', async () => {
    (globalThis as any).__EXPERIMENTAL__ = {};
    const { getAuthorizedPublicApiKey } = await import('./index');
    const loadUser = vi
      .fn()
      .mockResolvedValue(new InsightsUser(1, 'john@example.com', false, ['app-a']));

    await expect(
      getAuthorizedPublicApiKey(
        {
          params: {},
          sharedMap: new Map([['session', { user: { email: 'john@example.com' } }]]),
          error: vi.fn() as RequestEvent['error'],
        },
        'app-a',
        loadUser
      )
    ).resolves.toBe('app-a');
    expect(loadUser).toHaveBeenCalledWith('john@example.com');
  });
});

describe('symbol source loading', () => {
  test('labels missing metadata without inventing symbol values', async () => {
    const { displaySymbolDetail } = await import('./index');

    expect(displaySymbolDetail(null)).toBe('Metadata unavailable');
    expect(displaySymbolDetail('')).toBe('Metadata unavailable');
    expect(displaySymbolDetail('routeLoader$')).toBe('routeLoader$');
  });

  test('skips source loading when symbol details are already available', async () => {
    const { hasProvidedSymbolDetails } = await import('./index');

    expect(hasProvidedSymbolDetails(null, null)).toBe(true);
    expect(hasProvidedSymbolDetails(undefined, undefined)).toBe(false);
  });

  test('returns no source when the remote file cannot be loaded', async () => {
    const { fetchSourceText } = await import('./index');
    const fetchSource = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(
      fetchSourceText('https://example.com/source.tsx', fetchSource)
    ).resolves.toBeNull();
  });
});
