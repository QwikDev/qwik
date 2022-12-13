import type { RenderOptions } from '@builder.io/qwik';
import type { Render, RenderToStringResult } from '@builder.io/qwik/server';
import type { QwikCityEnvData, QwikCityMode } from '../../runtime/src/types';
import type { ServerRequestEvent, UserResponseContext } from './types';
import { getErrorHtml } from './error-handler';
import { HttpStatus } from './http-status-codes';

export function responsePage<T = unknown>(
  serverRequestEv: ServerRequestEvent,
  matchPathname: string,
  userResponseCtx: UserResponseContext,
  render: Render,
  opts?: RenderOptions
): T {
  const requestHeaders: Record<string, string> = {};
  serverRequestEv.request.headers.forEach((value, key) => (requestHeaders[key] = value));

  const responseHeaders = userResponseCtx.headers;
  if (!responseHeaders.has('Content-Type')) {
    responseHeaders.set('Content-Type', 'text/html; charset=utf-8');
  }

  return serverRequestEv.sendHeaders(
    userResponseCtx.status,
    responseHeaders,
    userResponseCtx.cookie,

    async (stream) => {
      // begin http streaming the page content as it's rendering html
      try {
        userResponseCtx.stream = stream;
        while (userResponseCtx.writeQueue.length > 0) {
          stream.write(userResponseCtx.writeQueue.shift());
        }

        const result = await render({
          stream: stream,
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
      } catch (e) {
        const errorHtml = getErrorHtml(HttpStatus.InternalServerError, e);
        stream.write(errorHtml);
      }
      stream.end();
    }
  );
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
