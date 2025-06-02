/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for Netlify Edge when building for production.
 *
 * Learn more about the Netlify integration here:
 * - https://qwik.dev/docs/deployments/netlify-edge/
 *
 */
import {
  createQwikCity,
  type PlatformNetlify,
} from "@builder.io/qwik-city/middleware/netlify-edge";
import qwikCityPlan from "@qwik-city-plan";
import render from "./entry.ssr";

declare global {
  interface QwikCityPlatform extends PlatformNetlify {}
}

export default createQwikCity({ render, qwikCityPlan });
