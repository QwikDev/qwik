import { handleInsightsBeacon } from '@qwik.dev/core/insights/collector';
import type { RequestHandler } from '@qwik.dev/router';

// Decentralized insights collector: the client tracker beacons here, and we record it into the
// libSQL/SQLite database from QWIK_INSIGHTS_DB_URL. Active when that env var is set (see vite.config).
export const onPost: RequestHandler = async ({ request, json }) => {
  await handleInsightsBeacon(request);
  json(200, { ok: true });
};
