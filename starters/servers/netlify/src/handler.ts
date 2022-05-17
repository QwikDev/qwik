import { render } from './entry.server';
import manifest from '../dist/q-manifest.json';
import type { QwikManifest } from '@builder.io/qwik/optimizer';

const handler = async (request: Request) => {
  try {
    // Handle static files
    if (/\.\w+$/.test(request.url)) {
      return;
    }

    const ssrResult = await render({
      url: request.url,
      base: '/build/',
      manifest: manifest as QwikManifest,
    });

    const response = new Response(ssrResult.html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
    return response;
  } catch (e) {
    // 500 Error
    return new Response(String(e), { status: 500 });
  }
};

export default handler;
