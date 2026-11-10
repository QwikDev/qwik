import { createQwikCity } from '@builder.io/qwik-city/middleware/cloudflare-pages';
import qwikCityPlan from '@qwik-city-plan';
import render from './entry.ssr';

// The Workers build uses Qwik City's Cloudflare Pages middleware and entry name.
// Preserve the existing Netlify handler's cross-origin telemetry behavior.
const fetch = createQwikCity({ render, qwikCityPlan, checkOrigin: false });

export { fetch };
