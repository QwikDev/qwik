import { qwikCity } from '@builder.io/qwik-city/middleware/cloudflare-pages';
import render from './entry.ssr';

const qwikCityMiddleware = qwikCity(render);

export const onRequestGet = [qwikCityMiddleware];
