/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for the Azure Static Web Apps middleware when building for production.
 *
 * Learn more about the Azure Static Web Apps integration here:
 * - https://qwik.dev/docs/deployments/azure-swa/
 *
 */
import {
  createQwikRouter,
  type PlatformAzure,
} from "@qwik.dev/router/middleware/azure-swa";
import render from "./entry.ssr";

declare global {
  type QwikRouterPlatform = PlatformAzure;
}

export default createQwikRouter({ render });
