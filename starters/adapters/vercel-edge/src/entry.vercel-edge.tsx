/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for Vercel Edge when building for production.
 *
 * Learn more about the Vercel Edge integration here:
 * - https://qwik.dev/docs/deployments/vercel-edge/
 *
 */
import qwikRouterConfig from "@qwik-router-config";
import {
  createQwikRouter,
  type PlatformVercel,
} from "@qwik.dev/router/middleware/vercel-edge";
import render from "./entry.ssr";

declare global {
  interface QwikRouterPlatform extends PlatformVercel {}
}

export default createQwikRouter({ render, qwikRouterConfig });
