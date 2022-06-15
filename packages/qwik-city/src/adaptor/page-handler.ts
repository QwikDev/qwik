import { renderToString, RenderToStringOptions } from '@builder.io/qwik/server';

export async function pageHandler(root: any, opts: RenderToStringOptions) {
  const result = await renderToString(root, opts);

  return new Response(result.html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
