/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for Firbease when building for production.
 *
 * Learn more about the Firebase integration here:
 * - https://qwik.dev/docs/deployments/firebase/
 *
 */
import qwikRouterConfig from "@qwik-router-config";
import {
  createQwikRouter,
  type PlatformFirebase,
} from "@qwik.dev/router/middleware/firebase";
import render from "./entry.ssr";

declare global {
  interface QwikRouterPlatform extends PlatformFirebase {}
}

export default createQwikRouter({ render, qwikRouterConfig });
