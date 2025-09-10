import type { RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = ({ request, headers }) => {
  // Needed for SharedArrayBuffer in the REPL
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
};
