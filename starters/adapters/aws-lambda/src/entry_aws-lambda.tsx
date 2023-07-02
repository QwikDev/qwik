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
});

export const qwikApp = serverless({
  handle: (req: any, res: any) => {
    staticFile(req, res, () => {
      router(req, res, () => {
        notFound(req, res, () => {});
      });
    });
  },
});
