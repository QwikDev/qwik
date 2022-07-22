import type { Render, StreamWriter } from '@builder.io/qwik/server';
import type { EndpointResponse, HttpMethod, RouteParams } from '../../runtime/src/library/types';
import { getQwikCityUserContext } from './utils';

export async function pageHandler(
  render: Render,
  url: URL,
  params: RouteParams,
  method: HttpMethod,
  endpointResponse: EndpointResponse,
  stream: StreamWriter
) {
  render({
    stream,
    url: url.href,
    userContext: getQwikCityUserContext(url, params, method, endpointResponse),
  }).then((res) => {
    if ('html' in res) {
      stream.write((res as any).html);
    }
  });
}
