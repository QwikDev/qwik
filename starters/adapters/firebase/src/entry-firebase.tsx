/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for Firbease when building for production.
 *
 * Learn more about the Netlify integration here:
 * - https://qwik.builder.io/docs/deployments/firebase/
 *
 */
import {
  createQwikCity,
  type PlatformFirebase,
} from "@builder.io/qwik-city/middleware/firebase";
import qwikCityPlan from "@qwik-city-plan";
import { manifest } from "@qwik-client-manifest";
import render from "./entry.ssr";

declare global {
  interface QwikCityPlatform extends PlatformFirebase {}
}

export default createQwikCity({ render, qwikCityPlan, manifest });
