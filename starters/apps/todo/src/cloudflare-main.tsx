import renderApp from './index.server.qwik';
import qmapping from '../public/build/q-symbols.json';
import { createQrlMapper } from '@builder.io/qwik/server';
import { getAssetFromKV } from "@cloudflare/kv-asset-handler";

async function handleQwik(request: Request) {

  const html = await renderApp({
    url: request.url,
    debug: true,
    qrlMapper: createQrlMapper(qmapping),
  });
  return new Response(html.html, {
    headers: { 'content-type': 'text/html' },
  })
}

addEventListener("fetch", (event: any) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/build/') || url.pathname.startsWith('/static/')) {
    try {
      event.respondWith(getAssetFromKV(event));
    } catch (e) {
      event.respondWith(new Response(`"${url.pathname}" not found`, {
        status: 404,
        statusText: "not found",
      }));
    }
  } else {
    event.respondWith(handleQwik(event.request))
  }
})
