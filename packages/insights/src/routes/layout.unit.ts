import type { RequestEvent } from '@qwik.dev/router';
import { describe, expect, it, vi } from 'vitest';
import { onRequest } from './layout';

describe('Login page redirect', () => {
  function request(pathname = '/', internalRequest: RequestEvent['internalRequest'] = false) {
    return {
      url: new URL(pathname, 'https://insights.qwik.dev'),
      internalRequest,
      sharedMap: new Map([['session', { user: { email: 'user@example.com' } }]]),
      redirect: vi.fn(() => new Error('Redirect')),
    };
  }

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
