import { component$, Slot } from '@qwik.dev/core';
import { routeLoader$, type RequestHandler } from '@qwik.dev/router';

export const onRequest: RequestHandler = (ev) => {
  throw ev.httpError(403, 'Members only');
};

export const useLayoutSecret = routeLoader$(() => 'layout secret');

export default component$(() => {
  const layoutSecret = useLayoutSecret();
  return (
    <div id="members-layout">
      <p>{layoutSecret.value}</p>
      <Slot />
    </div>
  );
});
