/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for the Deno HTTP server when building for production.
 *
 * Learn more about the Deno integration here:
 * - https://qwik.dev/docs/deployments/deno/
 * - https://docs.deno.com/runtime/tutorials/http_server
 *
 */
import { manifest } from "@qwik-client-manifest";
import qwikRouterConfig from "@qwik-router-config";
import { createQwikRouter } from "@qwik.dev/router/middleware/deno";
import render from "./entry.ssr";

// Create the Qwik Router Deno middleware
const { router, notFound, staticFile } = createQwikRouter({
  render,
  qwikRouterConfig,
  manifest,
});

// Allow for dynamic port
const port = Number(Deno.env.get("PORT") ?? 3009);

/* eslint-disable */
console.log(`Server starter: http://localhost:${port}/app/`);

Deno.serve({ port }, async (request: Request, info: any) => {
  const staticResponse = await staticFile(request);
  if (staticResponse) {
    return staticResponse;
  }

  // Server-side render this request with Qwik Router
  const qwikRouterResponse = await router(request, info);
  if (qwikRouterResponse) {
    return qwikRouterResponse;
  }

  // Path not found
  return notFound(request);
});

declare const Deno: any;
