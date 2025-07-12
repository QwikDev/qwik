// requestEv.sharedMap.get(RequestEvSharedActionId)

import type { RequestEvent } from '@qwik.dev/router';
import { IsQData } from '../user-response';
import {
  getRequestTrailingSlash,
  RequestEvIsRewrite,
  RequestEvQwikSerializer,
  type RequestEventInternal,
} from '../request-event';
import { getPathname } from '../resolve-request-handlers';

export interface QData {
  status: number;
  href: string;
  isRewrite?: boolean;
}

export async function qDataHandler(requestEv: RequestEvent) {
  const isPageDataReq = requestEv.sharedMap.has(IsQData);
  if (!isPageDataReq) {
    return;
  }

  if (requestEv.headersSent || requestEv.exited) {
    return;
  }

  const status = requestEv.status();
  const trailingSlash = getRequestTrailingSlash(requestEv);

  requestEv.headers.set('Content-Type', 'application/json; charset=utf-8');

  const qData: QData = {
    status,
    href: getPathname(requestEv.url, trailingSlash),
    isRewrite: requestEv.sharedMap.get(RequestEvIsRewrite),
  };
  const qwikSerializer = (requestEv as RequestEventInternal)[RequestEvQwikSerializer];

  // Set cache headers
  requestEv.cacheControl({
    maxAge: 300, // 5 minutes
    staleWhileRevalidate: 3600, // 1 hour
  });

  // write just the page json data to the response body
  const data = await qwikSerializer._serialize([qData]);

  requestEv.send(200, data);
}
