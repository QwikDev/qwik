/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for Firbease when building for production.
 *
 * Learn more about the Firebase integration here:
 * - https://qwik.dev/docs/deployments/firebase/
 *
 */
import qwikCityPlan from "@qwik-city-plan";
import { manifest } from "@qwik-client-manifest";
import {
  createQwikCity,
  type PlatformFirebase,
} from "@qwik.dev/city/middleware/firebase";
import render from "./entry.ssr";

declare global {
  interface QwikCityPlatform extends PlatformFirebase {}
}

export default createQwikCity({ render, qwikCityPlan, manifest });
