import { qwikCity } from '@builder.io/qwik-city/middleware/node';
import { fileURLToPath } from 'url';
import { join } from 'path';
import render from './entry.ssr';

export const distDir = join(fileURLToPath(import.meta.url), '..', '..', 'dist');
export const buildDir = join(distDir, 'build');

export const { router, notFound } = qwikCity(render);
