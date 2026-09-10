import {
  component$,
  createContextId,
  Slot,
  useContext,
  useSignal,
  type ComputedSignal,
} from '@qwik.dev/core';
import {
  Form,
  routeAction$,
  routeLoader$,
  useLocation,
  useNavigate,
  usePreventNavigate$,
} from '@qwik.dev/router';

export const useSharedData = routeLoader$(
  ({ url }) => ({ pathname: url.pathname, token: crypto.randomUUID() }),
  { id: 'lifecycle-layout' }
);
export const useRefreshAction = routeAction$((input, { redirect }) => {
  if (input.value === 'redirect') {
    throw redirect(303, '/qwikrouter-test/loader-navigation/42/');
  }
  return { ok: true, value: input.value };
});

const SharedConsumer = component$(() => (
  <span id="extra-loader-consumer">{useSharedData().value.pathname}</span>
));
const RemovableConsumer = component$(() => {
  const show = useSignal(true);
  return (
    <>
      {show.value && <SharedConsumer />}
      <button
        id="remove-loader-consumer"
        onClick$={() => {
          show.value = false;
        }}
      >
        Remove consumer
      </button>
    </>
  );
});
const SharedValue = component$(() => {
  const shared = useSharedData();
  return (
    <>
      <p id="shared-loader-path">{shared.value.pathname}</p>
      <output id="shared-loader-token">{shared.value.token}</output>
    </>
  );
});

export default component$(() => {
  const shared = useSharedData();
  const goto = useNavigate();
  const location = useLocation();
  const action = useRefreshAction();
  const completed = useSignal('');
  const blocked = useSignal(false);
  const blockedAttempts = useSignal(0);
  usePreventNavigate$((url) => {
    if (blocked.value && url instanceof URL && url.pathname.endsWith('/42/')) {
      blockedAttempts.value++;
      (window as any).__blockedLoaderNavigation = true;
      return true;
    }
    return false;
  });
  const context = useContext(createContextId<any>('qr-lc'));
  const state = useContext(createContextId<Record<string, unknown>>('qr-s'));
  const keys = useSignal('');
  return (
    <>
      <SharedValue />
      <output id="completed-loader-navigation">{completed.value}</output>
      <output id="loader-navigation-status">{location.isNavigating ? 'navigating' : 'idle'}</output>
      <output id="blocked-loader-navigation">{blockedAttempts.value}</output>
      <button
        id="block-loader-navigation"
        onClick$={() => {
          blocked.value = !blocked.value;
        }}
      >
        {blocked.value ? 'blocked' : 'allowed'}
      </button>
      <button
        id="refresh-shared-loader"
        onClick$={() => (shared as ComputedSignal<unknown>).invalidate(true)}
      >
        Refresh shared
      </button>
      <button
        id="save-parent-loader"
        onClick$={() => {
          (window as any).__savedParentLoader = state['navigation-parent'];
        }}
      >
        Save parent
      </button>
      <Form action={action} spaReset>
        <input aria-label="Action value" name="value" />
        <button id="loader-refresh-action" type="submit">
          Refresh action
        </button>
      </Form>
      <output id="loader-action-status">{action.isRunning ? 'running' : 'idle'}</output>
      <output id="loader-action-result">{action.value?.ok ? 'done' : ''}</output>
      <output id="loader-action-value">{String(action.value?.value ?? '')}</output>
      <RemovableConsumer />
      <button
        id="inspect-loader-state"
        onClick$={() => {
          (window as any).__navigateLoaderTest = goto;
          const probe = ((window as any).__loaderProbe ||= {
            ids: new WeakMap(),
            next: 1,
            snapshots: 0,
          });
          const readSignals = () =>
            Object.fromEntries(
              Object.entries(state)
                .filter(([id]) => !id.startsWith('__qwik_route_loader_value__'))
                .map(([id, signal]) => {
                  if (!probe.ids.has(signal)) {
                    probe.ids.set(signal, probe.next++);
                  }
                  return [id, probe.ids.get(signal)];
                })
            );
          (window as any).__readLoaderState = () => ({
            signals: readSignals(),
            values: Object.keys(state)
              .filter((id) => id.startsWith('__qwik_route_loader_value__'))
              .sort(),
            paths: Object.keys(context.loaderPaths).sort(),
          });
          keys.value = JSON.stringify({
            ...(window as any).__readLoaderState(),
            snapshotId: ++probe.snapshots,
          });
        }}
      >
        Inspect loaders
      </button>
      <output id="loader-state">{keys.value}</output>
      <button
        id="navigate-static"
        onClick$={() => {
          void goto('/qwikrouter-test/loader-navigation/child/').then(() => {
            completed.value = '/qwikrouter-test/loader-navigation/child/';
          });
        }}
      >
        Child
      </button>
      <button
        id="navigate-dynamic"
        onClick$={() => {
          void goto('/qwikrouter-test/loader-navigation/42/').then(() => {
            completed.value = '/qwikrouter-test/loader-navigation/42/';
          });
        }}
      >
        Dynamic
      </button>
      <button
        id="navigate-parent"
        onClick$={() => {
          void goto('/qwikrouter-test/loader-navigation/').then(() => {
            completed.value = '/qwikrouter-test/loader-navigation/';
          });
        }}
      >
        Parent
      </button>
      <button
        id="navigate-next-dynamic"
        onClick$={() => {
          void goto('/qwikrouter-test/loader-navigation/43/').then(() => {
            completed.value = '/qwikrouter-test/loader-navigation/43/';
          });
        }}
      >
        Next dynamic
      </button>
      <button
        id="navigate-old-redirect"
        onClick$={() => {
          void goto('/qwikrouter-test/loader-navigation/redirect/');
        }}
      >
        Redirect
      </button>
      <Slot />
    </>
  );
});
