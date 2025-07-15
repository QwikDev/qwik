/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for the Express HTTP server when building for production.
 *
 * Learn more about Node.js server integrations here:
 * - https://qwik.dev/docs/deployments/node/
 *
 */
import { createQwikRouter } from "@qwik.dev/router/middleware/node";
import { createServer } from "node:http";
import render from "./entry.ssr";

// Allow for dynamic port
const PORT = process.env.PORT ?? 3004;

// Create the Qwik Router express middleware
const { router, notFound, staticFile } = createQwikRouter({
  render,
  static: {
    cacheControl: "public, max-age=31536000, immutable",
  },
});

const server = createServer();

server.on("request", (req, res) => {
  staticFile(req, res, () => {
    router(req, res, () => {
      notFound(req, res, () => {});
    });
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Node server listening on http://localhost:${PORT}`);
});
