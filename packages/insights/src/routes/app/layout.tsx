import { Slot, component$ } from '@qwik.dev/core';
import { type RequestHandler } from '@qwik.dev/router';
import { dbGetInsightUser } from '~/db/sql-user';
import type { SessionData } from '../layout';
import { setInsightUser } from './insight-user';

export { getInsightUser } from './insight-user';

export const onRequest: RequestHandler = async ({ sharedMap, redirect }) => {
  const session = sharedMap.get('session') as SessionData;
  const email = session?.user?.email || null;
  if (!email) {
    throw redirect(307, '/');
  }
  const userInsight = await dbGetInsightUser(email);
  setInsightUser(sharedMap, userInsight);
};

export default component$(() => {
  return <Slot />;
});
