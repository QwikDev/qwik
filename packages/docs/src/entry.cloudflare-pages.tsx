import { qwikCity } from '@builder.io/qwik-city/middleware/cloudflare-pages';
import render from './entry.ssr';

export const onRequest = qwikCity(render);
