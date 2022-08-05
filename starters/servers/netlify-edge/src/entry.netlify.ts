import render from './entry.ssr';
import { qwikCity } from '@builder.io/qwik-city/middleware/netlify-edge';

const qwikCityHandler = qwikCity(render);

export default qwikCityHandler;
