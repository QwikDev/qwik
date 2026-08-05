import { describe, expect, test, vi } from 'vitest';
import type { RequestEvent } from '@qwik.dev/router';
import { ServerError } from '@qwik.dev/router/middleware/request-handler';
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
    const forbidden = new ServerError(403, 'Forbidden');
    const error = vi.fn(() => forbidden);

    expect(() =>
      getAuthorizedPublicApiKey({
        params: { publicApiKey: 'app-a' },
        sharedMap: new Map(),
        error: error as RequestEvent['error'],
      })
    ).toThrow(forbidden);
  });

  test('rejects a tenant that the current user cannot access', async () => {
    (globalThis as any).__EXPERIMENTAL__ = {};
    const { getAuthorizedPublicApiKey } = await import('./index');
    const forbidden = new ServerError(403, 'Forbidden');
    const error = vi.fn(() => forbidden);

    expect(() =>
      getAuthorizedPublicApiKey({
        params: { publicApiKey: 'app-b' },
        sharedMap: new Map([
          ['insightUser', new InsightsUser(1, 'john@example.com', false, ['app-a'])],
        ]),
        error: error as RequestEvent['error'],
      })
    ).toThrow(forbidden);
    expect(error).toHaveBeenCalledWith(403, 'Forbidden');
  });

  test('uses the route tenant when the current user can access it', async () => {
    (globalThis as any).__EXPERIMENTAL__ = {};
    const { getAuthorizedPublicApiKey } = await import('./index');

    expect(
      getAuthorizedPublicApiKey({
        params: { publicApiKey: 'app-a' },
        sharedMap: new Map([
          ['insightUser', new InsightsUser(1, 'john@example.com', false, ['app-a'])],
        ]),
        error: vi.fn() as RequestEvent['error'],
      })
    ).toBe('app-a');
  });
});
