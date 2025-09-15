/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for the Google Cloud Run middleware when building for production.
 *
 * Learn more about the Cloud Run integration here:
 * - https://qwik.dev/docs/deployments/gcp-cloud-run/
 *
 */
import {
  createQwikRouter,
  type PlatformNode,
} from "@qwik.dev/router/middleware/node";
import { createServer } from "node:http";
import render from "./entry.ssr";

declare global {
  type QwikRouterPlatform = PlatformNode;
}

/** The default headers used by helmet */
const DEFAULT_HEADERS = {
  "Content-Security-Policy": [
    `default-src 'self'`,
    `base-uri 'self'`,
    `font-src 'self' https: data:`,
    `form-action 'self'`,
    `frame-ancestors 'self'`,
    `img-src 'self' data:`,
    `object-src 'none'`,
    `script-src 'self'`,
    `script-src-attr 'none'`,
    `style-src 'self' https: 'unsafe-inline'`,
    `upgrade-insecure-requests`,
  ].join(";"),
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Origin-Agent-Cluster": "?1",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-DNS-Prefetch-Control": "off",
  "X-Download-Options": "noopen",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Permitted-Cross-Domain-Policies": "none",
  "X-XSS-Protection": "0",
};

const { router, notFound, staticFile } = createQwikRouter({
  render,
  static: {
    cacheControl: "public, max-age=31536000, immutable",
  },
  getOrigin(req) {
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Proto
    const protocol = req.headers["x-forwarded-proto"] ?? "http";
    const host = req.headers["host"];
    return `${protocol}://${host}`;
  },
  getClientConn: (conn) => {
    const xForwardedFor = conn.headers["x-forwarded-for"];
    if (typeof xForwardedFor === "string") {
      return {
        ip: xForwardedFor.split(",").shift()?.trim(),
      };
    } else if (Array.isArray(xForwardedFor)) {
      return {
        ip: xForwardedFor.shift()?.trim(),
      };
    }
    return {
      ip: undefined,
    };
  },
});

const server = createServer();

server.on("request", (req, res) => {
  for (const header of Object.entries(DEFAULT_HEADERS)) {
    res.setHeader(...header);
  }

  staticFile(req, res, () => {
    router(req, res, () => {
      notFound(req, res, () => {});
    });
  });
});

server.listen(process.env.PORT ?? 8080);
