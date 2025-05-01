/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for Netlify Edge when building for production.
 *
 * Learn more about the Netlify integration here:
 * - https://qwik.dev/docs/deployments/netlify-edge/
 *
 */
import qwikRouterConfig from "@qwik-router-config";
import {
  createQwikRouter,
  type PlatformNetlify,
} from "@qwik.dev/router/middleware/netlify-edge";
import render from "./entry.ssr";

declare global {
  interface QwikRouterPlatform extends PlatformNetlify {}
}

export default createQwikRouter({ render, qwikRouterConfig });
