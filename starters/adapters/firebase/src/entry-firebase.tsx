/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for Firbease when building for production.
 *
 * Learn more about the Firebase integration here:
 * - https://qwik.dev/docs/deployments/firebase/
 *
 */
import {
  createQwikRouter,
  type PlatformFirebase,
} from "@qwik.dev/router/middleware/firebase";
import render from "./entry.ssr";

declare global {
  type QwikRouterPlatform = PlatformFirebase;
}

export default createQwikRouter({ render });
