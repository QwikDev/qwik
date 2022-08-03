import type { Render, RenderToStringResult } from '@builder.io/qwik/server';
import type { QwikCityUserContext } from '../../runtime/src/library/types';
import type { QwikCityRequestContext, QwikCityRequestOptions, UserResponseContext } from './types';

export function pageHandler<T = any>(
  requestCtx: QwikCityRequestContext,
  userResponse: UserResponseContext,
  render: Render,
  opts?: QwikCityRequestOptions
): Promise<T> {
  const { status, headers } = userResponse;
  const { response, url } = requestCtx;

  if (!headers.has('Content-Type')) {
    // default to text/html content if it wasn't provided
    headers.set('Content-Type', 'text/html; charset=utf-8');
  }

  return response(status, headers, async (stream) => {
    const result = await render({
      stream,
      url: url.href,
      userContext: getQwikCityUserContext(userResponse),
      ...opts,
    });
    if ((typeof result as any as RenderToStringResult).html === 'string') {
      stream.write((result as any as RenderToStringResult).html);
    }
  });
}

export function getQwikCityUserContext(userResponseContext: UserResponseContext): {
  qwikcity: QwikCityUserContext;
} {
  const { url, params, pendingBody, resolvedBody, status } = userResponseContext;
  return {
    qwikcity: {
      route: {
        href: url.href,
        pathname: url.pathname,
        params: { ...params },
        query: Object.fromEntries(url.searchParams.entries()),
      },
      response: {
        body: pendingBody || resolvedBody,
        status: status,
      },
    },
  };
}
