// requestEv.sharedMap.get(RequestEvSharedActionId)

import type { RequestEvent } from '@qwik.dev/router';
import { _serialize } from 'packages/qwik/core-internal';
import { RequestEvIsRewrite, RequestEvSharedActionId } from './request-event';
import { getPathname } from './resolve-request-handlers';
import { IsQData } from './user-response';

export interface QData {
  status: number;
  href: string;
  action?: string;
  redirect?: string;
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
  const redirectLocation = requestEv.headers.get('Location');

  requestEv.headers.set('Content-Type', 'application/json; charset=utf-8');

  const qData: QData = {
    status,
    href: getPathname(requestEv.url),
    action: requestEv.sharedMap.get(RequestEvSharedActionId),
    redirect: redirectLocation ?? undefined,
    isRewrite: requestEv.sharedMap.get(RequestEvIsRewrite),
  };

  // Set cache headers
  requestEv.cacheControl({
    maxAge: 300, // 5 minutes
    staleWhileRevalidate: 3600, // 1 hour
  });

  // write just the page json data to the response body
  const data = await _serialize([qData]);

  requestEv.send(200, data);
}
