import { describe, expect, it } from 'vitest';
import type { RenderRoot } from '@qwik.dev/core';
import { renderToString } from '@qwik.dev/core/server';
import { _setRouterConfig } from './router-config';
import { ServiceWorkerRegister } from './sw-component';

const renderScript = async (nonce?: string) =>
  (
    await renderToString(ServiceWorkerRegister as RenderRoot<{ nonce?: string }>, {
      props: { nonce },
    })
  ).html;

describe('ServiceWorkerRegister', () => {
  it('registers the service worker of the app', async () => {
    _setRouterConfig({ routes: {}, serviceWorkerUrl: '/app/service-worker.js' } as any);
    const html = await renderScript('abc');

    expect(html).toContain('nonce="abc"');
    expect(html).toContain('register("/app/service-worker.js")');
  });

  it('unregisters a service worker the app no longer defines', async () => {
    _setRouterConfig({ routes: {} } as any);

    expect(await renderScript()).toContain('unregister()');
  });
});
