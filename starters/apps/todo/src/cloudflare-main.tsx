import { renderApp } from './index.server.qwik';
import symbols from '../server/build/q-symbols.json';
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

async function handleQwik(request: Request) {
  const html = await renderApp({
    url: request.url,
    symbols,
  });
  return new Response(html.html, {
    headers: { 'content-type': 'text/html' },
  });
}

addEventListener('fetch', (event: any) => {
  const url = new URL(event.request.url);
  if (/\.\w+$/.test(url.pathname)) {
    try {
      event.respondWith(getAssetFromKV(event));
    } catch (e) {
      event.respondWith(
        new Response(`"${url.pathname}" not found`, {
          status: 404,
          statusText: 'not found',
        })
      );
    }
  } else {
    event.respondWith(handleQwik(event.request));
  }
});
