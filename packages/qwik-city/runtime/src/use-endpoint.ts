import { getClientDataPath } from './utils';
import { dispatchPrefetchEvent } from './client-navigate';
import { CLIENT_DATA_CACHE } from './constants';
import type { ClientPageData, RouteActionValue } from './types';

export const loadClientData = async (
  href: string,
  clearCache?: boolean,
  action?: RouteActionValue
) => {
  const url = new URL(href);
  const pagePathname = url.pathname;
  const pageSearch = url.search;
  const clientDataPath = getClientDataPath(pagePathname, pageSearch, action);
  let qData = undefined;
  if (!action) {
    qData = CLIENT_DATA_CACHE.get(clientDataPath);
  }

  dispatchPrefetchEvent({
    links: [pagePathname],
  });

  if (!qData) {
    const actionData = action?.data;
    if (action) {
      action.data = undefined;
    }
    const options: RequestInit | undefined = actionData
      ? {
          method: 'POST',
          body: actionData,
        }
      : undefined;
    qData = fetch(clientDataPath, options).then((rsp) => {
      if ((rsp.headers.get('content-type') || '').includes('json')) {
        const redirectedURL = new URL(rsp.url);
        if (redirectedURL.origin !== location.origin || !isQDataJson(redirectedURL.pathname)) {
          location.href = redirectedURL.href;
          return;
        }
        // we are safe we are reading a q-data.json
        return rsp.text().then((text) => {
          const clientData = parseData(text) as ClientPageData;
          if (clearCache) {
            CLIENT_DATA_CACHE.delete(clientDataPath);
          }
          if (action) {
            const actionData = clientData.loaders[action.id];
            action.resolve!({ status: rsp.status, result: actionData });
          }
          return clientData;
        });
      } else {
        CLIENT_DATA_CACHE.delete(clientDataPath);
      }
    });

    if (!action) {
      CLIENT_DATA_CACHE.set(clientDataPath, qData);
    }
  }

  return qData;
};

function parseData(str: string) {
  return JSON.parse(str, (_, value) => {
    if (value && typeof value === 'object' && value.__brand === 'formdata') {
      return formDataFromArray(value.value);
    }
    return value;
  });
}

function formDataFromArray(array: [string, string][]): FormData {
  const formData = new FormData();
  for (const [key, value] of array) {
    formData.append(key, value);
  }
  return formData;
}

export const isQDataJson = (pathname: string) => {
  return pathname.endsWith(QDATA_JSON);
};

export const QDATA_JSON = '/q-data.json';
