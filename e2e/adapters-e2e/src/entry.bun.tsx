/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for the Bun HTTP server when building for production.
 */
import { createQwikRouter } from '@qwik.dev/router/middleware/bun';
import render from './entry.ssr';

declare const Bun: {
  env: Record<string, string | undefined>;
  serve: (options: { fetch: (request: Request) => Promise<Response>; port: number }) => unknown;
};

const { router, staticFile } = createQwikRouter({
  render,
  static: {
    cacheControl: 'public, max-age=31536000, immutable',
  },
});

const port = Number(Bun.env.PORT ?? 3000);

// eslint-disable-next-line no-console
console.log(`Server started: http://localhost:${port}/`);

Bun.serve({
  async fetch(request: Request) {
    const staticResponse = await staticFile(request);
    if (staticResponse) {
      return staticResponse;
    }

    return (await router(request))!;
  },
  port,
});
