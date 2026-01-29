import { Slot, component$ } from '@builder.io/qwik';

import { PopupManager } from '~/components/popup-manager';
import { routeLoader$ } from '@builder.io/qwik-city';
import type { GetSessionResult } from '@auth/qwik';

export type SessionData = Awaited<GetSessionResult>['data'];

export const useUserSession = routeLoader$(({ sharedMap, redirect, url }) => {
  const session = sharedMap.get('session') as SessionData;
  if (session && url.pathname === '/') {
    // if authorized user try to access login page then redirect to app page
    throw redirect(307, '/app/');
  }
  return session;
});

export default component$(() => {
  return (
    <PopupManager>
      <Slot />
    </PopupManager>
  );
});
