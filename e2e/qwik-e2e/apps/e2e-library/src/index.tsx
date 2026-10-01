import {
  component$,
  createContextId,
  Slot,
  useContext,
  useSignal,
  useTask$,
  untrack,
} from '@qwik.dev/core';
import { getBasePathname, getRequestEvent, getRoutes, Link, server$ } from '@qwik.dev/router';
import { ServerError } from '@qwik.dev/router/middleware/request-handler';

export interface Greeting {
  greeting: string;
}

export const GreetingContext = createContextId<Greeting>('e2e-library.greeting');

/** Lets the app detect whether the library evaluated its own copy of core. */
export const libraryUseSignal = useSignal;

export const LibCounter = component$(() => {
  const count = useSignal(0);
  const taskRuns = useSignal(0);
  const greeting = useContext(GreetingContext);

  useTask$(() => {
    count.value;
    untrack(() => taskRuns.value++);
  });

  return (
    <div id="lib-counter">
      <p id="lib-greeting">{greeting.greeting}</p>
      <p id="lib-count">{count.value}</p>
      <p id="lib-task-runs">{taskRuns.value}</p>
      <button id="lib-increment" onClick$={() => count.value++}>
        +
      </button>
    </div>
  );
});

/** A router link rendered by the library's own copy of the router. */
export const LibLink = component$((props: { href: string }) => {
  return (
    <Link id="lib-link" href={props.href}>
      <Slot />
    </Link>
  );
});

const readRequestPath = server$(function () {
  return this.url.pathname;
});

const rejectRequest = server$(() => {
  throw new ServerError(403, 'rejected by the library');
});

/** Reads the request and the route config through the library's own copy of the router. */
export const LibRequest = component$(() => {
  const requestPath = useSignal('');
  const hasRequestEvent = useSignal(false);
  const basePathname = useSignal('');
  const hasRoutes = useSignal(false);
  const rejection = useSignal('');

  useTask$(async () => {
    requestPath.value = await readRequestPath();
    hasRequestEvent.value = !!getRequestEvent();
    basePathname.value = getBasePathname();
    hasRoutes.value = !!(await getRoutes());
  });

  return (
    <div id="lib-request">
      <p id="lib-request-path">{requestPath.value}</p>
      <p id="lib-request-event">{String(hasRequestEvent.value)}</p>
      <p id="lib-base-pathname">{basePathname.value}</p>
      <p id="lib-routes">{String(hasRoutes.value)}</p>
      <button
        id="lib-reject"
        onClick$={async () => {
          try {
            await rejectRequest();
          } catch (error) {
            rejection.value = String(error);
          }
        }}
      >
        reject
      </button>
      <p id="lib-rejection">{rejection.value}</p>
    </div>
  );
});
