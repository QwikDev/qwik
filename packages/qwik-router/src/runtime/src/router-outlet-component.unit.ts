import { assert, test, vi, type Mock } from 'vitest';
import { handleRouterPopstate } from './router-outlet-component';
import type { RouteNavigate } from './types';
import { Q_ROUTER_POPSTATE_EVENT } from './spa-init';

test('handleRouterPopstate forwards the bridged href to goto as popstate navigation', async () => {
  const nav = vi.fn(async () => undefined) as unknown as RouteNavigate;

  await handleRouterPopstate(
    nav,
    new CustomEvent(Q_ROUTER_POPSTATE_EVENT, {
      detail: {
        href: 'http://localhost/scroll-restoration/page-short/',
      },
    })
  );

  assert.deepEqual((nav as unknown as Mock).mock.calls, [
    ['http://localhost/scroll-restoration/page-short/', { type: 'popstate' }],
  ]);
});

test('handleRouterPopstate ignores bridge events without an href', async () => {
  const nav = vi.fn(async () => undefined) as unknown as RouteNavigate;

  await handleRouterPopstate(nav, new CustomEvent(Q_ROUTER_POPSTATE_EVENT, { detail: {} }));

  assert.deepEqual((nav as unknown as Mock).mock.calls, []);
});
