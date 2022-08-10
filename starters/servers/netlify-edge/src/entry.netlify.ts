import { qwikCity } from '@builder.io/qwik-city/middleware/netlify-edge';
import render from './entry.ssr';

const qwikCityHandler = qwikCity(render);

export default qwikCityHandler;
