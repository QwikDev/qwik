import type { Render } from '@builder.io/qwik/server';
import type { EndpointResponse, HttpMethod, RouteParams } from '../../runtime/src/library/types';
import { createPageHeaders, getQwikCityUserContext, getStatus } from './utils';

export async function pageHandler(
  render: Render,
  url: URL,
  params: RouteParams,
  method: HttpMethod,
  endpointResponse: EndpointResponse | null
) {
  const status = getStatus(endpointResponse?.status, 200, 599, 200);
  const headers = createPageHeaders(endpointResponse?.headers);

  const result = await render({
    url: url.href,
    userContext: getQwikCityUserContext(url, params, method, endpointResponse),
  });

  return new Response(result.html, {
    status,
    headers,
  });
}
