/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for the Deno HTTP server when building for production.
 *
 * Learn more about the Deno integration here:
 * - https://qwik.builder.io/docs/deployments/deno/
 * - https://deno.com/manual/examples/http_server
 *
 */
import { createQwikCity } from '@builder.io/qwik-city/middleware/deno';
import qwikCityPlan from '@qwik-city-plan';
import { manifest } from '@qwik-client-manifest';
import render from './entry.ssr';

// Create the Qwik City Deno middleware
const { router, notFound, staticFile } = createQwikCity({
  render,
  qwikCityPlan,
  manifest,
});

// Allow for dynamic port
const port = Number(Deno.env.get('PORT') ?? 8080);

// Start the Deno server
const server = Deno.listen({ port });

/* eslint-disable */
console.log(`Server started: http://localhost:${port}/`);

// https://deno.com/manual/examples/http_server
// Connections to the server will be yielded up as an async iterable.
for await (const conn of server) {
  serveHttp(conn);
}

async function serveHttp(conn: any) {
  const httpConn = Deno.serveHttp(conn);

  // Each request sent over the HTTP connection will be yielded as an
  // async iterator from the HTTP connection.
  for await (const requestEvent of httpConn) {
    const staticResponse = await staticFile(requestEvent.request);
    if (staticResponse) {
      // Serve static file
      requestEvent.respondWith(staticResponse);
      continue;
    }

    // Server-side render this request with Qwik City
    const qwikCityResponse = await router(requestEvent.request);
    if (qwikCityResponse) {
      requestEvent.respondWith(qwikCityResponse);
      continue;
    }

    // Path not found
    requestEvent.respondWith(notFound(requestEvent.request));
  }
}

declare const Deno: any;
