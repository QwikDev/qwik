import type { RequestEvent } from '@qwik.dev/router';
import { dbGetInsightUser, type InsightsUser } from '~/db/sql-user';
import { getInsightUser } from '~/routes/app/insight-user';

type LoadInsightsUser = (email: string) => Promise<InsightsUser>;

export async function getAuthorizedPublicApiKey(
  requestEvent: Pick<RequestEvent, 'params' | 'sharedMap' | 'error'>,
  requestedPublicApiKey = requestEvent.params.publicApiKey,
  loadUser: LoadInsightsUser = dbGetInsightUser
): Promise<string> {
  const session = requestEvent.sharedMap.get('session') as
    | { user?: { email?: string | null } }
    | undefined;
  const email = session?.user?.email;
  const insightUser =
    (getInsightUser(requestEvent.sharedMap) as InsightsUser | undefined) ??
    (email ? await loadUser(email) : undefined);
  if (!requestedPublicApiKey || !insightUser?.isAuthorizedForApp(requestedPublicApiKey)) {
    throw requestEvent.error(403, 'Forbidden');
  }
  return requestedPublicApiKey;
}
