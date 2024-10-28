/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for the Bun HTTP server when building for production.
 *
 * Learn more about the Bun integration here:
 * - https://qwik.dev/docs/deployments/bun/
 * - https://bun.sh/docs/api/http
 *
 */
import { manifest } from "@qwik-client-manifest";
import qwikRouterConfig from "@qwik-router-config";
import { createQwikRouter } from "@qwik.dev/router/middleware/bun";
import render from "./entry.ssr";

// Create the Qwik Router Bun middleware
const { router, notFound, staticFile } = createQwikRouter({
  render,
  qwikRouterConfig,
  manifest,
});

// Allow for dynamic port
const port = Number(Bun.env.PORT ?? 3000);

// eslint-disable-next-line no-console
console.log(`Server started: http://localhost:${port}/`);

Bun.serve({
  async fetch(request: Request) {
    const staticResponse = await staticFile(request);
    if (staticResponse) {
      return staticResponse;
    }

    // Server-side render this request with Qwik Router
    const qwikRouterResponse = await router(request);
    if (qwikRouterResponse) {
      return qwikRouterResponse;
    }

    // Path not found
    return notFound(request);
  },
  port,
});
