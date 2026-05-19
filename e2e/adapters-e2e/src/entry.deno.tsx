/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for the Deno HTTP server when building for production.
 */
import { createQwikRouter } from '@qwik.dev/router/middleware/deno';
import render from './entry.ssr';

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (
    options: { port: number },
    handler: (request: Request, info: unknown) => Promise<Response>
  ) => unknown;
};

const { router, staticFile } = createQwikRouter({
  render,
  static: {
    cacheControl: 'public, max-age=31536000, immutable',
  },
});

const port = Number(Deno.env.get('PORT') ?? 3000);

// eslint-disable-next-line no-console
console.log(`Server started: http://localhost:${port}/`);

Deno.serve({ port }, async (request: Request, info: unknown) => {
  const staticResponse = await staticFile(request);
  if (staticResponse) {
    return staticResponse;
  }

  return (await router(request, info as never))!;
});
