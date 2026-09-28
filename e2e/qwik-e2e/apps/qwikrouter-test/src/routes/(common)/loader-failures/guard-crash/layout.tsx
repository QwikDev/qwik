import { component$, Slot } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useSession = routeLoader$((): string => {
  throw new Error('session check failed');
});

export default component$(() => <Slot />);
