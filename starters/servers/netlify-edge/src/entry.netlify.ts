import render from './entry.ssr';
import { qwikCity } from '@builder.io/qwik-city/middleware/netlify-edge';

const qwikCityHandler = qwikCity(render, {
  prefetchStrategy: {
    implementation: 'link-prefetch',
  },
});

export default qwikCityHandler;
