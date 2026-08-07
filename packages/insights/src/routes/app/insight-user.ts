import type { InsightsUser } from '~/db/sql-user';

const INSIGHT_USER = 'insightUser';

export function setInsightUser(sharedMap: Map<string, any>, insightUser: InsightsUser) {
  sharedMap.set(INSIGHT_USER, insightUser);
  return insightUser;
}

export function getInsightUser(sharedMap: Map<string, any>) {
  return sharedMap.get(INSIGHT_USER) as InsightsUser;
}
