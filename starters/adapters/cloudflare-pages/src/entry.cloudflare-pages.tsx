/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for Cloudflare Pages when building for production.
 *
 * Learn more about the Cloudflare Pages integration here:
 * - https://qwik.dev/docs/deployments/cloudflare-pages/
 *
 */
import {
  createQwikRouter,
  type PlatformCloudflarePages,
} from "@qwik.dev/router/middleware/cloudflare-pages";
import render from "./entry.ssr";

declare global {
  type QwikRouterPlatform = PlatformCloudflarePages;
}

const fetch = createQwikRouter({ render });

export { fetch };
