import { Slot, component$ } from '@builder.io/qwik';
import { type RequestHandler } from '@builder.io/qwik-city';
import { dbGetInsightUser, type InsightsUser } from '~/db/sql-user';
import type { SessionData } from '../layout';

export const onRequest: RequestHandler = async ({ sharedMap, redirect }) => {
  const session = sharedMap.get('session') as SessionData;
  const email = session?.user?.email || null;
  if (!email) {
    throw redirect(307, '/');
  }
  const userInsight = await dbGetInsightUser(email);
  setInsightUser(sharedMap, userInsight);
};

const INSIGHT_USER = 'insightUser';
function setInsightUser(sharedMap: Map<string, any>, insightUser: InsightsUser) {
  sharedMap.set(INSIGHT_USER, insightUser);
  return insightUser;
}

export function getInsightUser(sharedMap: Map<string, any>) {
  return sharedMap.get(INSIGHT_USER) as InsightsUser;
}

export default component$(() => {
  return <Slot />;
});
