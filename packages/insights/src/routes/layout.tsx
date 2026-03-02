import { Slot, component$ } from '@qwik.dev/core';

import { PopupManager } from '~/components/popup-manager';
import { routeLoader$ } from '@qwik.dev/router';
import type { GetSessionResult } from '@auth/qwik';

export type SessionData = Awaited<GetSessionResult>['data'];

// Uncomment the following to mock an authenticated user
// export const onRequest = async ({ sharedMap, env }: { sharedMap: Map<string, any>; env: any }) => {
//   sharedMap.set('session', {
//     expires: new Date(0).toString(),
//     user: {
//       id: 'user',
//       name: 'user',
//       email: 'user@localhost',
//     },
//   } as SessionData);
// };

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
