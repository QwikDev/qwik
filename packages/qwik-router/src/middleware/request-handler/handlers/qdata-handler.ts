import { _serialize } from '@qwik.dev/core/internal';
import type { RequestEvent } from '@qwik.dev/router';
import { RequestEvIsRewrite } from '../request-event';
import { getPathname } from '../resolve-request-handlers';

export interface QData {
  status: number;
  href: string;
  isRewrite?: boolean;
}

// TODO get rid of qdata.json entirely
export async function qDataHandler(requestEv: RequestEvent) {
  if (requestEv.headersSent || requestEv.exited) {
    return;
  }

  const status = requestEv.status();

  requestEv.headers.set('Content-Type', 'application/json; charset=utf-8');

  const qData: QData = {
    status,
    href: getPathname(requestEv.url),
    isRewrite: requestEv.sharedMap.get(RequestEvIsRewrite),
  };

  // Set cache headers
  requestEv.cacheControl({
    maxAge: 60, // 1 minute
  });

  // write just the page json data to the response body
  const data = await _serialize([qData]);

  requestEv.send(200, data);
}
