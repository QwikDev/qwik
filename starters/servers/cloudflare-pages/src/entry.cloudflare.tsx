/* eslint-disable */

// @ts-ignore
import { render } from './entry.server';

// @ts-ignore
import symbols from '../server/q-symbols.json';

export const qwikSSR = async (req: any) => {
  const ssrResult = await render({
    url: new URL(req.request.url),
    symbols,
  });

  const response = new Response(ssrResult.html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
  return response;
};
