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
import { createQwikCity } from "@builder.io/qwik-city/middleware/bun";
import qwikCityPlan from "@qwik-city-plan";
import render from "./entry.ssr";

// Create the Qwik City Bun middleware
const { router, notFound, staticFile } = createQwikCity({
  render,
  qwikCityPlan,
  static: {
    cacheControl: "public, max-age=31536000, immutable",
  },
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

    // Server-side render this request with Qwik City
    const qwikCityResponse = await router(request);
    if (qwikCityResponse) {
      return qwikCityResponse;
    }

    // Path not found
    return notFound(request);
  },
  port,
});
