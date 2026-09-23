import { component$, createContextId, Slot, useContext, useSignal } from '@qwik.dev/core';
import { Form, Link, routeAction$, useLocation, useNavigate } from '@qwik.dev/router';

import { useCached, useImmutable } from './cache';

export const useRefreshAction = routeAction$(() => ({ ok: true }));

export default component$(() => {
  const action = useRefreshAction();
  const location = useLocation();
  const goto = useNavigate();
  const state = useContext(createContextId<Record<string, unknown>>('qr-s'));
  const snapshot = useSignal('');
  return (
    <>
      <Link
        id="prefetch-cache-loaders"
        data-cached-id={(useCached as any).__id}
        data-immutable-id={(useImmutable as any).__id}
        href="/qwikrouter-test.prod/loader-cache/cache/"
        prefetchData="intent"
        prefetchBundles="intent"
      >
        Cache
      </Link>
      <button
        id="navigate-parent"
        onClick$={() => {
          void goto('/qwikrouter-test.prod/loader-cache/');
        }}
      >
        Parent
      </button>
      <output id="loader-navigation-status">{location.isNavigating ? 'navigating' : 'idle'}</output>
      <Form action={action}>
        <button id="loader-refresh-action" type="submit">
          Refresh
        </button>
      </Form>
      <output id="loader-action-result">{action.value?.ok ? 'done' : ''}</output>
      <button
        id="inspect-loader-state"
        onClick$={() => {
          const probe = ((window as any).__loaderProbe ||= {
            ids: new WeakMap(),
            next: 1,
            snapshots: 0,
          });
          snapshot.value = JSON.stringify({
            snapshotId: ++probe.snapshots,
            signals: Object.fromEntries(
              Object.entries(state)
                .filter(([id]) => !id.startsWith('__qwik_route_loader_value__'))
                .map(([id, signal]) => {
                  if (!probe.ids.has(signal)) {
                    probe.ids.set(signal, probe.next++);
                  }
                  return [id, probe.ids.get(signal)];
                })
            ),
          });
        }}
      >
        Inspect
      </button>
      <output id="loader-state">{snapshot.value}</output>
      <Slot />
    </>
  );
});
