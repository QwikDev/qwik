import type { RequestEvent } from '@qwik.dev/router';
import type { InsightsUser } from '~/db/sql-user';
import { getInsightUser } from '~/routes/app/insight-user';

export function getAuthorizedPublicApiKey(
  requestEvent: Pick<RequestEvent, 'params' | 'sharedMap' | 'error'>
) {
  const publicApiKey = requestEvent.params.publicApiKey;
  const insightUser = getInsightUser(requestEvent.sharedMap) as InsightsUser | undefined;
  if (!publicApiKey || !insightUser?.isAuthorizedForApp(publicApiKey)) {
    throw requestEvent.error(403, 'Forbidden');
  }
  return publicApiKey;
}
