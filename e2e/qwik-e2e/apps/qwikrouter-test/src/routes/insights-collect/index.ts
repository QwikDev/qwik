import { handleInsightsBeacon } from '@qwik.dev/core/insights/collector';
import type { RequestHandler } from '@qwik.dev/router';

// Decentralized insights collector: the client tracker beacons here; we record it into the
// configured libSQL/SQLite database (QWIK_INSIGHTS_DB_URL) and reply immediately.
export const onPost: RequestHandler = async ({ request, json }) => {
  json(200, { ok: await handleInsightsBeacon(request) });
};
