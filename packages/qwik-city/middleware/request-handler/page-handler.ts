import type { Render } from '@builder.io/qwik/server';
import type { EndpointResponse } from '../../runtime/src/library/types';
import { createPageHeaders, getQwikCityUserContext, getStatus } from './utils';

export async function pageHandler(
  render: Render,
  url: URL,
  endpointResponse: EndpointResponse | null
) {
  const status = getStatus(endpointResponse?.status, 200, 599, 200);
  const headers = createPageHeaders(endpointResponse?.headers);

  const result = await render({
    url: url.href,
    userContext: getQwikCityUserContext(endpointResponse),
  });

  return new Response(result.html, {
    status,
    headers,
  });
}
