import type { Render } from '@builder.io/qwik/server';
import type { EndpointResponse, HttpMethod, RouteParams } from '../../runtime/src/library/types';
import { getQwikCityUserContext } from './utils';

export async function pageHandler(
  render: Render,
  url: URL,
  params: RouteParams,
  method: HttpMethod,
  endpointResponse: EndpointResponse
) {
  const { status, headers } = endpointResponse;

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'text/html; charset=utf-8');
  }

  const result = await render({
    url: url.href,
    userContext: getQwikCityUserContext(url, params, method, endpointResponse),
  });

  return new Response(result.html, {
    status,
    headers,
  });
}
