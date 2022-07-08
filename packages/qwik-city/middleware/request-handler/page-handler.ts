import type { Render } from '@builder.io/qwik/server';
import type { HttpMethod } from '../../runtime/src/library/types';
import { getHttpEquivResponse } from './utils';

export async function pageHandler(render: Render, method: HttpMethod, url: URL) {
  const result = await render({
    url: url.href,
  });

  const { status, headers } = getHttpEquivResponse(result);
  const redirectLocation = headers.get('location');
  if (redirectLocation) {
    return new Response('', {
      status,
      headers,
    });
  }

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'text/html; charset=utf-8');
  }

  if (!headers.has('Cache-Control')) {
    headers.set(
      'Cache-Control',
      'max-age=120, s-maxage=60, stale-while-revalidate=604800, stale-if-error=604800'
    );
  }

  return new Response(result.html, {
    status,
    headers,
  });
}
