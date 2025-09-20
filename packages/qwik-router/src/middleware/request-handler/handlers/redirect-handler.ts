import { RedirectMessage, RequestEvent } from '@qwik.dev/router/middleware/request-handler';
import { isQDataRequestBasedOnSharedMap } from '../resolve-request-handlers';
import { QDATA_JSON, QManifestHash } from '../user-response';

export async function handleRedirect(requestEv: RequestEvent) {
  const isPageDataReq = isQDataRequestBasedOnSharedMap(
    requestEv.sharedMap,
    requestEv.request.headers
  );
  if (!isPageDataReq) {
    return;
  }

  try {
    await requestEv.next();
  } catch (err) {
    if (!(err instanceof RedirectMessage)) {
      throw err;
    }
  }
  if (requestEv.headersSent) {
    return;
  }

  const status = requestEv.status();
  const location = requestEv.headers.get('Location');
  const isRedirect = status >= 301 && status <= 308 && location;

  if (isRedirect) {
    const adaptedLocation = makeQDataPath(location, requestEv.sharedMap);
    if (adaptedLocation) {
      requestEv.headers.set('Location', adaptedLocation);
      requestEv.getWritableStream().close();
      return;
    } else {
      requestEv.status(200);
      requestEv.headers.delete('Location');
    }
  }
}

function makeQDataPath(href: string, sharedMap: Map<string, unknown>) {
  if (href.startsWith('/')) {
    const url = new URL(href, 'http://localhost');
    const pathname = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
    const manifestHash = sharedMap.get(QManifestHash) as string;
    const append = manifestHash ? `/q-loader-data.${manifestHash}.json` : QDATA_JSON;

    if (!append) {
      return undefined;
    }

    return pathname + (append.startsWith('/') ? '' : '/') + append + url.search;
  } else {
    return undefined;
  }
}
