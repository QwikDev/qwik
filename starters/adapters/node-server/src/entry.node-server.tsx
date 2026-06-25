/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for the Express HTTP server when building for production.
 *
 * Learn more about Node.js server integrations here:
 * - https://qwik.dev/docs/deployments/node/
 *
 */
import { getRequestEvent } from "@qwik.dev/router";
import { createQwikRouter } from "@qwik.dev/router/middleware/node";
import { createServer } from "node:http";
import render from "./entry.ssr";

// Allow for dynamic port
const PORT = process.env.PORT ?? 3004;

// Create the Qwik Router express middleware
const { router, staticFile } = createQwikRouter({
  render,
  static: {
    cacheControl: "public, max-age=31536000, immutable",
  },
});

const server = createServer();

// Optional request-aware diagnostics for crashes that escape request boundaries.
// This does not prevent Node from crashing, but it does provide better diagnostics for uncaught exceptions.
// See the Node documentation to handle uncaught exceptions and unhandled rejections in your app.
process.on("uncaughtExceptionMonitor", (error, origin) => {
  const requestEv = getRequestEvent();
  if (requestEv) {
    console.error("Unhandled exception during request", {
      origin,
      method: requestEv.method,
      url: requestEv.url.href,
      headersSent: requestEv.headersSent,
      error,
    });
    return;
  }

  console.error("Unhandled exception outside request", { origin, error });
});

server.on("request", (req, res) => {
  staticFile(req, res, () => {
    router(req, res, () => {});
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Node server listening on http://localhost:${PORT}`);
});
