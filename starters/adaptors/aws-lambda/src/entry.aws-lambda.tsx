import { createQwikCity } from '@builder.io/qwik-city/middleware/node';
import qwikCityPlan from '@qwik-city-plan';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import render from './entry.ssr';

export const distDir = join(fileURLToPath(import.meta.url), '..', '..', 'dist');
export const buildDir = join(distDir, 'build');

export const { router, notFound } = createQwikCity({ render, qwikCityPlan });
