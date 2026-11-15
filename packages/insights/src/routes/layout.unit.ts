import type { RequestEvent } from '@qwik.dev/router';
import { describe, expect, it, vi } from 'vitest';
import { onRequest } from './layout';

const { getExistingUser } = vi.hoisted(() => ({ getExistingUser: vi.fn() }));
vi.mock('@qwik.dev/core/build', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isDev: true,
}));
vi.mock('~/db', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDB: () => ({ select: () => ({ from: () => ({ where: () => ({ get: getExistingUser }) }) }) }),
}));

describe('Login page redirect', () => {
  function request(pathname = '/', internalRequest: RequestEvent['internalRequest'] = false) {
    return {
      env: { get: (): string | undefined => undefined },
      error: vi.fn(() => new Error('Unknown development identity')),
      url: new URL(pathname, 'https://insights.qwik.dev'),
      internalRequest,
      sharedMap: new Map([['session', { user: { email: 'user@example.com' } }]]),
      redirect: vi.fn(() => new Error('Redirect')),
    };
  }

  it('uses an existing database user on localhost', async () => {
    const event = request('/app/');
    event.url = new URL('http://localhost:5173/app/');
    event.env.get = () => 'local@example.com';
    getExistingUser.mockResolvedValueOnce({ id: 1 });
    await onRequest(event as unknown as RequestEvent);
    expect(event.sharedMap.get('session')?.user.email).toBe('local@example.com');
  });

  it('rejects unknown local identities without creating users', async () => {
    const event = request('/app/');
    event.url = new URL('http://localhost:5173/app/');
    event.env.get = () => 'unknown@example.com';
    getExistingUser.mockResolvedValueOnce(undefined);
    await expect(onRequest(event as unknown as RequestEvent)).rejects.toThrow(
      'Unknown development identity'
    );
    expect(event.error).toHaveBeenCalledWith(403, expect.any(String));
  });

  it('redirects signed-in visitors from the login page to their applications', async () => {
    const event = request();

    await expect(onRequest(event as unknown as RequestEvent)).rejects.toThrow('Redirect');
    expect(event.redirect).toHaveBeenCalledWith(307, '/app/');
  });

  it.each(['loader', 'action'] as const)(
    'allows signed-in %s requests at the root to return their data',
    async (internalRequest) => {
      const event = request('/', internalRequest);

      await onRequest(event as unknown as RequestEvent);

      expect(event.redirect).not.toHaveBeenCalled();
    }
  );

  it('allows signed-out visitors to see the login page', async () => {
    const event = request();
    event.sharedMap.delete('session');

    await onRequest(event as unknown as RequestEvent);

    expect(event.redirect).not.toHaveBeenCalled();
  });

  it('allows signed-in visitors to open application pages', async () => {
    const event = request('/app/example/edit/');

    await onRequest(event as unknown as RequestEvent);

    expect(event.redirect).not.toHaveBeenCalled();
  });
});
