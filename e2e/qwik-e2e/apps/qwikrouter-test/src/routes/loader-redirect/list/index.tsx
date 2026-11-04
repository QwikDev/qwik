import {
  component$,
  noSerialize,
  Pending,
  useSignal,
  useTask$,
  type NoSerialize,
} from '@qwik.dev/core';
import {
  Link,
  routeLoader$,
  useLocation,
  useNavigate,
  usePreventNavigate$,
} from '@qwik.dev/router';

export const useList = routeLoader$(
  ({ url, redirect, cookie }) => {
    const redirectMode = cookie.get('loader-redirect-mode')?.value;
    if (redirectMode === 'hash' || redirectMode === 'same' || redirectMode === 'search') {
      cookie.delete('loader-redirect-mode', { path: '/' });
      const destination = new URL(url);
      if (redirectMode === 'search') {
        destination.searchParams.set('noise', 'one');
      } else if (redirectMode === 'hash') {
        destination.hash = 'items';
      }
      throw redirect(302, `${destination.pathname}${destination.search}${destination.hash}`);
    }
    const sort = url.searchParams.get('sort');
    if (!sort) {
      const kind = url.searchParams.get('kind');
      throw redirect(
        302,
        `/qwikrouter-test/loader-redirect/list/?sort=new${kind ? `&kind=${kind}` : ''}`
      );
    }
    return sort === 'undefined' ? undefined : { sort, items: ['a', 'b', 'c'] };
  },
  { id: 'redirect-list', search: ['sort', 'kind'], serializationStrategy: 'always' }
);

const ListValue = component$(() => {
  const signal = useList();
  const location = useLocation();
  if (signal.error) {
    return <p id="loader-redirect-error">{signal.error.message}</p>;
  }
  const list = signal.value;
  return (
    <p id="loader-redirect-value">
      {location.url.searchParams.get('kind') === 'undefined' && list === undefined
        ? 'undefined'
        : `${list!.items.length} items, sorted by ${list!.sort}`}
    </p>
  );
});

export default component$(() => {
  const list = useList();
  const location = useLocation();
  const kind = location.url.searchParams.get('kind');
  const navigate = useNavigate();
  const read = useSignal('');
  const blocked = useSignal(false);
  const blockedAttempts = useSignal(0);
  const completed = useSignal(0);
  const deferGuard = useSignal(false);
  const repeatedNavigations = useSignal(0);
  const waitForLoader = useSignal(false);
  const interruptNavigation = useSignal(false);
  const guardResolution = useSignal<NoSerialize<(result: boolean | Error) => void>>();
  useTask$(({ track }) => {
    if (track(() => location.isNavigating) && interruptNavigation.value) {
      interruptNavigation.value = false;
      navigate('?sort=new');
    }
  });
  usePreventNavigate$((url) => {
    if (!(url instanceof URL)) {
      return false;
    }
    if (waitForLoader.value && url.searchParams.get('sort') === 'new') {
      blockedAttempts.value++;
      return list.promise().then(() => true);
    }
    if (deferGuard.value && url.searchParams.get('sort') === 'new') {
      return new Promise<boolean>((resolve, reject) => {
        guardResolution.value = noSerialize((result) => {
          if (result instanceof Error) {
            reject(result);
          } else {
            resolve(result);
          }
        });
      });
    }
    if (
      blocked.value &&
      (url.searchParams.get('sort') === 'new' ||
        url.pathname === '/qwikrouter-test/loader-redirect/')
    ) {
      blockedAttempts.value++;
      return true;
    }
    return false;
  });
  return (
    <main id="loader-redirect-list">
      <output id="loader-redirect-pending">{list.pending ? 'pending' : 'ready'}</output>
      <output id="loader-redirect-navigation">
        {location.isNavigating ? 'navigating' : 'idle'}
      </output>
      <Pending fallback$={() => <p id="loader-redirect-loading">Loading</p>} delay={0}>
        <ListValue />
      </Pending>
      <button
        id="loader-redirect-read"
        onClick$={() => {
          const value = list.value;
          read.value = value === undefined ? 'undefined' : value.sort;
        }}
      >
        Read previous value
      </button>
      <output id="loader-redirect-read-value">{read.value}</output>
      <button id="loader-redirect-block" onClick$={() => (blocked.value = !blocked.value)}>
        {blocked.value ? 'blocked' : 'allowed'}
      </button>
      <output id="loader-redirect-blocked-attempts">{blockedAttempts.value}</output>
      <button
        id="loader-redirect-wait-before-leave"
        onClick$={() => {
          waitForLoader.value = true;
          interruptNavigation.value = true;
        }}
      >
        Wait for the current loader before leaving
      </button>
      <button
        id="loader-redirect-settle"
        onClick$={async () => {
          await list.promise();
          completed.value++;
        }}
      >
        Wait for loader
      </button>
      <output id="loader-redirect-completed">{completed.value}</output>
      <button
        id="loader-redirect-repeat"
        onClick$={async () => {
          await navigate.resolve();
          navigate(location.url.href);
          repeatedNavigations.value++;
        }}
      >
        Repeat current navigation
      </button>
      <output id="loader-redirect-repeated">{repeatedNavigations.value}</output>
      <button id="loader-redirect-refresh" onClick$={() => list.invalidate(true)}>
        Refresh
      </button>
      <button id="loader-redirect-defer" onClick$={() => (deferGuard.value = true)}>
        {deferGuard.value ? 'deferred' : 'immediate'}
      </button>
      <button
        id="loader-redirect-release-guard"
        disabled={!guardResolution.value}
        onClick$={() => {
          guardResolution.value?.(true);
          guardResolution.value = undefined;
        }}
      >
        Reject deferred navigation
      </button>
      <button
        id="loader-redirect-fail-guard"
        disabled={!guardResolution.value}
        onClick$={() => {
          guardResolution.value?.(new Error('Navigation guard failed.'));
          guardResolution.value = undefined;
        }}
      >
        Fail deferred guard
      </button>
      <Link
        id="loader-redirect-home-link"
        href="/qwikrouter-test/loader-redirect/"
        prefetch={false}
      >
        Home
      </Link>
      <Link id="loader-redirect-other-link" href="?sort=other" prefetch={false}>
        Other sort
      </Link>
      <Link
        id="loader-redirect-again"
        href={`/qwikrouter-test/loader-redirect/list/${kind ? `?kind=${kind}` : ''}`}
        prefetch={false}
      >
        Redirect
      </Link>
    </main>
  );
});
