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
