import { Slot, component$ } from '@qwik.dev/core';

import { NavigationLoader } from '~/components/navigation-loader';
import { PopupManager } from '~/components/popup-manager';
import { type RequestHandler } from '@qwik.dev/router';
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

export const onRequest: RequestHandler = async ({ sharedMap, redirect, url }) => {
  const session = sharedMap.get('session') as SessionData;
  if (session && url.pathname === '/') {
    // if authorized user try to access login page then redirect to app page
    throw redirect(307, '/app/');
  }
};

export default component$(() => {
  return (
    <PopupManager>
      <Slot />
      <NavigationLoader />
    </PopupManager>
  );
});
