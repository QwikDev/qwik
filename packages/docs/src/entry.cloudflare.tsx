import render from './entry.ssr';
import { qwikCity } from '@builder.io/qwik-city/middleware/cloudflare-pages';

const qwikCityMiddleware = qwikCity(render, {
  prefetchStrategy: {
    implementation: 'worker-fetch',
  },
});

export const onRequestGet = [qwikCityMiddleware];
