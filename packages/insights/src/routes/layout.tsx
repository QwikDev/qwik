import { Slot, component$ } from '@qwik.dev/core';
import { isDev } from '@qwik.dev/core/build';
import { getDevIdentity } from '~/dev-identity';
import { eq } from 'drizzle-orm';
import { getDB, usersTable } from '~/db';

import { NavigationLoader } from '~/components/navigation-loader';
import { PopupManager } from '~/components/popup-manager';
import { type RequestHandler } from '@qwik.dev/router';
import type { GetSessionResult } from '@auth/qwik';

export type SessionData = Awaited<GetSessionResult>['data'];

export const onRequest: RequestHandler = async ({
  sharedMap,
  redirect,
  url,
  internalRequest,
  env,
  error,
}) => {
  const devEmail = getDevIdentity(isDev, url, env.get('PRIVATE_DEV_USER_EMAIL'));
  if (devEmail) {
    const existingUser = await getDB()
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, devEmail))
      .get();
    if (!existingUser) {
      throw error(403, 'The development identity must match an existing Insights user.');
    }
    sharedMap.set('session', {
      expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      user: { email: devEmail },
    } as SessionData);
  }
  const session = sharedMap.get('session') as SessionData;
  if (session && url.pathname === '/' && !internalRequest) {
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
