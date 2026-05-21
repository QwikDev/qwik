import { getRequestEvent } from "@builder.io/qwik-city";
import express from "express";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import render from "./entry.ssr";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * Create an express server
 * https://expressjs.com/
 */
const app = express();

/**
 * Optional request-aware diagnostics for crashes that escape request boundaries.
 * This does not prevent Node from crashing, but it does provide better diagnostics for uncaught exceptions.
 * See the Node documentation to handle uncaught exceptions and unhandled rejections in your app.
 */
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

/**
 * Serve static client build files,
 * hashed filenames, immutable cache-control
 */
app.use(
  "/build",
  express.static(join(__dirname, "..", "dist", "build"), {
    immutable: true,
    maxAge: "1y",
  }),
);

/**
 * Serve static public files at the root
 */
app.use(express.static(join(__dirname, "..", "dist"), { index: false }));

/**
 * Server-Side Render Qwik application
 */
app.get("/*", async (req, res, next) => {
  try {
    // Render the Root component to a string
    const result = await render({
      stream: res,
    });

    // respond with SSR'd HTML
    if ("html" in result) {
      res.send((result as any).html);
    } else {
      res.end();
    }
  } catch (e) {
    // Error while server-side rendering
    next(e);
  }
});

/**
 * Start the express server
 */
app.listen(8080, () => {
  /* eslint-disable */
  console.log(`http://localhost:8080/`);
});
