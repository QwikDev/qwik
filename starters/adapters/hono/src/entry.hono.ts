/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for the Hono server when building for production.
 *
 * Learn more about the Bun integration here:
 * - https://qwik.dev/docs/deployments/bun/
 * - https://hono.dev/docs/getting-started/bun
 *
 */
import { getRequestEvent } from "@builder.io/qwik-city";
import { createQwikCity } from "@builder.io/qwik-city/middleware/bun";
import qwikCityPlan from "@qwik-city-plan";
import render from "./entry.ssr";
import { Hono } from "hono";

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

const app = new Hono();

// eslint-disable-next-line no-console
console.log(`Server started: http://localhost:${port}/`);

// Optional request-aware diagnostics for crashes that escape request boundaries.
// This does not prevent Bun from crashing, but it does provide better diagnostics.
process.on("uncaughtException", (error) => {
  const requestEv = getRequestEvent();
  if (requestEv) {
    console.error("Unhandled exception during request", {
      method: requestEv.method,
      url: requestEv.url.href,
      headersSent: requestEv.headersSent,
      error,
    });
    return;
  }

  console.error("Unhandled exception outside request", { error });
});

process.on("unhandledRejection", (reason) => {
  const requestEv = getRequestEvent();
  if (requestEv) {
    console.error("Unhandled rejection during request", {
      method: requestEv.method,
      url: requestEv.url.href,
      headersSent: requestEv.headersSent,
      reason,
    });
    return;
  }

  console.error("Unhandled rejection outside request", { reason });
});

app.all("*", async (c) => {
  const request = c.req.raw;

  const staticResponse = await staticFile(request);
  if (staticResponse) {
    return staticResponse;
  }

  const qwikCityResponse = await router(request);
  if (qwikCityResponse) {
    return qwikCityResponse;
  }

  return notFound(request);
});

export default {
  port,
  fetch: app.fetch,
};
