import { describe, expect, it } from 'vitest';
import { _setRouterConfig } from './router-config';
import { ServiceWorkerRegister } from './sw-component';

const renderScript = (nonce?: string) => (ServiceWorkerRegister({ nonce }) as any).props;

describe('ServiceWorkerRegister', () => {
  it('registers the service worker of the app', () => {
    _setRouterConfig({ routes: {}, serviceWorkerUrl: '/app/service-worker.js' } as any);
    const props = renderScript('abc');

    expect(props.nonce).toBe('abc');
    expect(props.dangerouslySetInnerHTML).toContain('register("/app/service-worker.js")');
  });

  it('unregisters a service worker the app no longer defines', () => {
    _setRouterConfig({ routes: {} } as any);

    expect(renderScript().dangerouslySetInnerHTML).toContain('unregister()');
  });
});
