import type { RenderOptions } from '@builder.io/qwik';
import type { Render, RenderToStringResult } from '@builder.io/qwik/server';
import type { QwikCityEnvData, RequestEvent } from '../../runtime/src/types';
import { getRequestAction, getRequestLoaders } from './request-event';

export async function responsePage<T = unknown>(
  requestEv: RequestEvent,
  render: Render,
  opts?: RenderOptions
) {
  const requestHeaders: Record<string, string> = {};
  requestEv.request.headers.forEach((value, key) => (requestHeaders[key] = value));

  const stream = requestEv.getWriter();
  const responseHeaders = requestEv.headers;
  if (!responseHeaders.has('Content-Type')) {
    responseHeaders.set('Content-Type', 'text/html; charset=utf-8');
  }

  try {
    const result = await render({
      stream,
      envData: getQwikCityEnvData(requestEv),
      ...opts,
    });
    if ((typeof result as any as RenderToStringResult).html === 'string') {
      // render result used renderToString(), so none of it was streamed
      // write the already completed html to the stream
      stream.write((result as any as RenderToStringResult).html);
    }
  } finally {
    stream.close();
  }
}

export function getQwikCityEnvData(requestEv: RequestEvent<unknown>): {
  url: string;
  requestHeaders: Record<string, string>;
  locale: string | undefined;
  qwikcity: QwikCityEnvData;
} {
  const { url, params, request, status, locale } = requestEv;
  const requestHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (requestHeaders[key] = value));

  return {
    url: new URL(url.pathname + url.search, url).href,
    requestHeaders,
    locale: locale(),
    qwikcity: {
      // mode: getRequestMode(requestEv),
      params: { ...params },
      response: {
        status: status(),
        loaders: getRequestLoaders(requestEv),
        action: getRequestAction(requestEv),
      },
    },
  };
}
