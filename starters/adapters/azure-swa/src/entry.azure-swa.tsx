import { createQwikCity, type PlatformAzure } from '@builder.io/qwik-city/middleware/azure-swa';
import qwikCityPlan from '@qwik-city-plan';
import { manifest } from '@qwik-client-manifest';
import render from './entry.ssr';

declare global {
  interface QwikCityPlatform extends PlatformAzure {}
}

export default createQwikCity({ render, qwikCityPlan, manifest });
