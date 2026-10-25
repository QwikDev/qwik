import { component$, Slot } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useSession = routeLoader$((ev): string => {
  throw ev.httpError(401, 'Sign in');
});

export default component$(() => {
  const session = useSession();
  return (
    <div id="guard-layout">
      <p>{session.value}</p>
      <Slot />
    </div>
  );
});
