import qwikCityPlan from '@qwik-city-plan';
import { createQwikCity } from '@qwik.dev/city/middleware/cloudflare-pages';
import render from './entry.ssr';

const fetch = createQwikCity({ render, qwikCityPlan });

export { fetch };
