import qwikCityPlan from '@qwik-city-plan';
import { createQwikCity } from '@qwikdev/city/middleware/node';
import render from './entry.ssr';

/** The default export is the QwikCity adapter used by Vite preview. */
export default createQwikCity({ render, qwikCityPlan });
