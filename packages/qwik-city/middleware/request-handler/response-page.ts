import type { RenderOptions } from '@builder.io/qwik';
import type { Render, RenderToStringResult } from '@builder.io/qwik/server';
import type { QwikCityEnvData, QwikCityMode, RequestEvent } from '../../runtime/src/types';
import type { UserResponseContext } from './types';

export async function responsePage<T = unknown>(
  requestEv: RequestEvent,
  render: Render,
  opts?: RenderOptions
) {
  const requestHeaders: Record<string, string> = {};
  requestEv.request.headers.forEach((value, key) => (requestHeaders[key] = value));

  const stream = requestEv.stream;
  const responseHeaders = requestEv.headers;
  if (!responseHeaders.has('Content-Type')) {
    responseHeaders.set('Content-Type', 'text/html; charset=utf-8');
  }

  const result = await render({
    stream,
    envData: getQwikCityEnvData(
      requestHeaders,
      matchPathname,
      userResponseCtx,
      serverRequestEv.mode
    ),
    ...opts,
  });
  if ((typeof result as any as RenderToStringResult).html === 'string') {
    // render result used renderToString(), so none of it was streamed
    // write the already completed html to the stream
    stream.write((result as any as RenderToStringResult).html);
  }
  stream.end();
}

export function getQwikCityEnvData(
  requestHeaders: Record<string, string>,
  matchPathname: string,
  userResponseCtx: UserResponseContext,
  mode: QwikCityMode
): {
  url: string;
  requestHeaders: Record<string, string>;
  locale: string | undefined;
  qwikcity: QwikCityEnvData;
} {
  const { url, params, status, loaders, locale } = userResponseCtx;
  return {
    url: new URL(matchPathname + url.search, url).href,
    requestHeaders,
    locale,
    qwikcity: {
      mode: mode,
      params: { ...params },
      response: {
        status: status,
        loaders,
      },
    },
  };
}
