import type { ClientPageData, RequestEvent } from '../../runtime/src/types';
import { getRequestAction, getRequestLoaders } from './request-event';

export function responseQData(requestEv: RequestEvent) {
  const requestHeaders: Record<string, string> = {};
  requestEv.request.headers.forEach((value, key) => (requestHeaders[key] = value));
  requestEv.headers.set('Content-Type', 'application/json; charset=utf-8');

  const status = requestEv.status();
  const qData: ClientPageData = {
    loaders: getRequestLoaders(requestEv),
    action: getRequestAction(requestEv),
    status: status !== 200 ? status : undefined,
    redirect: (status >= 301 && status <= 308 && requestEv.headers.get('location')) || undefined,
  };

  const stream = requestEv.getWriter();

  // write just the page json data to the response body
  stream.write(serializeData(qData));

  if (typeof stream.clientData === 'function') {
    // a data fn was provided by the request context
    // useful for writing q-data.json during SSG
    stream.clientData(qData);
  }

  stream.close();
}

function serializeData(data: any) {
  return JSON.stringify(data, (_, value) => {
    if (value instanceof FormData) {
      return {
        __brand: 'formdata',
        value: formDataToArray(value),
      };
    }
    return value;
  });
}

function formDataToArray(formData: FormData) {
  const array: [string, string][] = [];
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      array.push([key, value]);
    } else {
      array.push([key, value.name]);
    }
  });
  return array;
}
