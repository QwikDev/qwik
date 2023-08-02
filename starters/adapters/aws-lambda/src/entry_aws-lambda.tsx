/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for the Express HTTP server when building for production.
 *
 * Learn more about Node.js server integrations here:
 * - https://qwik.builder.io/docs/deployments/node/
 *
 */
import "source-map-support/register";
import {
  createQwikCity,
  type PlatformNode,
} from "@builder.io/qwik-city/middleware/node";
import qwikCityPlan from "@qwik-city-plan";
import { manifest } from "@qwik-client-manifest";
import serverless from "serverless-http";
import render from "./entry.ssr";

declare global {
  interface QwikCityPlatform extends PlatformNode {}
}

// Create the Qwik City router
const { router, notFound, staticFile } = createQwikCity({
  render,
  qwikCityPlan,

  manifest,
  static: {
    cacheControl: "public, max-age=31557600",
  },
  getOrigin(req) {
    if (process.env.IS_OFFLINE) {
      return `http://${req.headers.host}`;
    }
    return null;
  },
});

export const qwikApp = serverless(
  {
    handle: (req: any, res: any) => {
      req.url = fixPath(req.url);
      staticFile(req, res, () => {
        router(req, res, () => {
          notFound(req, res, () => {});
        });
      });
    },
  },
  {
    binary: true,
  },
);

function fixPath(path: string) {
  if (qwikCityPlan.trailingSlash) {
    const url = new URL(path, "http://aws-qwik.local");
    if (url.pathname.includes(".", url.pathname.lastIndexOf("/"))) {
      return path;
    }
    if (!url.pathname.endsWith("/")) {
      return url.pathname + "/" + url.search;
    }
  }
  return path;
}
