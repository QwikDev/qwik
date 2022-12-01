import { createQwikCity } from '@builder.io/qwik-city/middleware/node';
import render from './entry.ssr';
import qwikCityPlan from '@qwik-city-plan';

/**
 * The default export is the QwikCity adaptor used by Vite preview.
 */
export default createQwikCity({ render, qwikCityPlan });
