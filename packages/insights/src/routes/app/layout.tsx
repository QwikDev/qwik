import type { Session } from '@auth/core/types';
import { Slot, component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';

export const useIsAuthUser = routeLoader$(({ sharedMap, redirect }) => {
  const session = sharedMap.get('session') as Session | null;
  if (!session) {
    throw redirect(307, '/');
  }
});

export default component$(() => {
  return <Slot />;
});
