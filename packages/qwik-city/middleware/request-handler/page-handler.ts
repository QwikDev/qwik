import type { Render } from '@builder.io/qwik/server';
import type {
  HttpMethod,
  NormalizedEndpointResponse,
  RouteParams,
} from '../../runtime/src/library/types';
import { getQwikCityUserContext, getStatus } from './utils';

export async function pageHandler(
  render: Render,
  url: URL,
  params: RouteParams,
  method: HttpMethod,
  endpointResponse: NormalizedEndpointResponse | null
) {
  const status = getStatus(endpointResponse?.status, 200, 599, 200);
  const headers: Record<string, string> = {
    ...endpointResponse?.headers,
  };

  if (typeof headers['content-type'] !== 'string') {
    headers['content-type'] = 'text/html; charset=utf-8';
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
