import qwikCityPlan from '@qwik-city-plan';
import { createQwikCity } from '@qwikdev/city/middleware/cloudflare-pages';
import render from './entry.ssr';

const fetch = createQwikCity({ render, qwikCityPlan });

export { fetch };
