import {
  component$,
  Resource,
  getLocale,
  withLocale,
  useSignal,
  useVisibleTask$,
} from "@qwik.dev/core";
import type { RequestHandler } from "@qwik.dev/router";
import { routeLoader$, server$ } from "@qwik.dev/router";

// Simple in-memory barrier to coordinate two concurrent requests in tests.
type Barrier = {
  waiters: Set<string>;
  promise?: Promise<void>;
  resolve?: () => void;
};

const barriers = new Map<string, Barrier>();

function getBarrier(group: string): Barrier {
  let b = barriers.get(group);
  if (!b) {
    b = { waiters: new Set() };
    barriers.set(group, b);
  }
  return b;
}

function waitForBoth(group: string, id: string) {
  const barrier = getBarrier(group);
  if (!barrier.promise) {
    barrier.promise = new Promise<void>(
      (resolve) => (barrier.resolve = resolve),
    );
  }
  barrier.waiters.add(id);
  if (barrier.waiters.size >= 2) {
    barrier.resolve?.();
  }
  return barrier.promise!;
}

export const onRequest: RequestHandler = ({ url, locale }) => {
  const qpLocale = url.searchParams.get("locale");
  if (qpLocale) {
    locale(qpLocale);
  }
};

export const getAsyncLocale = server$((locale: string) => {
  return withLocale(locale, async () => {
    await waitForBoth("locale-server", locale);
    return getLocale();
  });
});

export const useBarrier = routeLoader$(({ url }) => {
  const group = url.searchParams.get("group") || "default";
  const id = url.searchParams.get("id") || Math.random().toString(36).slice(2);
  return waitForBoth(group, id).then(() => ({ done: true }));
});

export default component$(() => {
  const serverLocale = useSignal("unknown");
  const barrier = useBarrier();
  useVisibleTask$(async () => {
    serverLocale.value = await getAsyncLocale(getLocale());
  });
  return (
    <section>
      <p>
        Before barrier locale: <span class="locale-before">{getLocale()}</span>
      </p>
      <Resource
        value={barrier}
        onResolved={() => (
          <p>
            After barrier locale: <span class="locale">{getLocale()}</span>
          </p>
        )}
      />
      <p>
        Server locale: <span class="locale-server">{serverLocale.value}</span>
      </p>
    </section>
  );
});
