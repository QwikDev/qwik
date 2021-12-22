import { renderApp } from './index.server';
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import symbols from '../server/build/q-symbols.json';

async function handleRequest(event: any) {
  const url = new URL(event.request.url);
  if (/\.\w+$/.test(url.pathname)) {
    try {
      return getAssetFromKV(event);
    } catch (e) {
      return new Response(`"${url.pathname}" not found`, {
        status: 404,
        statusText: 'not found',
      });
    }
  } else {
    const html = await renderApp({
      url: event.request.url,
      symbols,
    });
    return new Response(html.html, {
      headers: { 'content-type': 'text/html' },
    });
  }
}

addEventListener('fetch', (event: any) => {
  event.respondWith(handleRequest(event.request));
});
