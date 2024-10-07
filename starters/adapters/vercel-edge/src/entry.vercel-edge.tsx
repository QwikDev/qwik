/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for Vercel Edge when building for production.
 *
 * Learn more about the Vercel Edge integration here:
 * - https://qwik.dev/docs/deployments/vercel-edge/
 *
 */
import qwikCityPlan from "@qwik-city-plan";
import { manifest } from "@qwik-client-manifest";
import {
  createQwikCity,
  type PlatformVercel,
} from "@qwik.dev/city/middleware/vercel-edge";
import render from "./entry.ssr";

declare global {
  interface QwikCityPlatform extends PlatformVercel {}
}

export default createQwikCity({ render, qwikCityPlan, manifest });
