import { createQwikCity } from '@builder.io/qwik-city/middleware/azure-swa';
import qwikCityPlan from '@qwik-city-plan';
import render from './entry.ssr';

export default createQwikCity({ render, qwikCityPlan });
