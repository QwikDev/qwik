/* eslint-disable */

// @ts-ignore
import { render } from './entry.server';

import symbols from '../server/q-symbols.json';

export const qwikSSR: PagesFunction = async (ev) => {
  const ssrResult = await render({
    url: new URL(ev.request.url),
    symbols,
  });

  const response = new Response(ssrResult.html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
  return response;
};
