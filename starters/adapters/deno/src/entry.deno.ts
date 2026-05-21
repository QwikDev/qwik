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
import { getRequestEvent } from "@builder.io/qwik-city";
import { createQwikCity } from "@builder.io/qwik-city/middleware/deno";
import qwikCityPlan from "@qwik-city-plan";
import render from "./entry.ssr";

// Create the Qwik City Deno middleware
const { router, notFound, staticFile } = createQwikCity({
  render,
  qwikCityPlan,
  static: {
    cacheControl: "public, max-age=31536000, immutable",
  },
});

// Allow for dynamic port
const port = Number(Deno.env.get("PORT") ?? 3009);

/* eslint-disable */
console.log(`Server starter: http://localhost:${port}/app/`);

// Optional request-aware diagnostics for crashes that escape request boundaries.
// This does not prevent Deno from crashing, but it does provide better diagnostics.
// See Deno runtime event docs for error and unhandled rejection behavior.
globalThis.addEventListener("error", (event: ErrorEvent) => {
  const requestEv = getRequestEvent();
  if (requestEv) {
    console.error("Unhandled exception during request", {
      method: requestEv.method,
      url: requestEv.url.href,
      headersSent: requestEv.headersSent,
      error: event.error,
    });
    return;
  }

  console.error("Unhandled exception outside request", {
    error: event.error,
  });
});

globalThis.addEventListener(
  "unhandledrejection",
  (event: PromiseRejectionEvent) => {
    const requestEv = getRequestEvent();
    if (requestEv) {
      console.error("Unhandled rejection during request", {
        method: requestEv.method,
        url: requestEv.url.href,
        headersSent: requestEv.headersSent,
        reason: event.reason,
      });
      return;
    }

    console.error("Unhandled rejection outside request", {
      reason: event.reason,
    });
  },
);

Deno.serve({ port }, async (request: Request, info: any) => {
  const staticResponse = await staticFile(request);
  if (staticResponse) {
    return staticResponse;
  }

  // Server-side render this request with Qwik City
  const qwikCityResponse = await router(request, info);
  if (qwikCityResponse) {
    return qwikCityResponse;
  }

  // Path not found
  return notFound(request);
});

declare const Deno: any;
