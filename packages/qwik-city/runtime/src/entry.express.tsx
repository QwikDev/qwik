import express from 'express';
import { fileURLToPath } from 'url';
import { join } from 'path';
import { qwikCity, qwikCity404 } from '../../middleware/express';
import render from './entry.ssr';
import cityPlan from '@qwik-city-plan';

// directories where the static assets are located
const distDir = join(fileURLToPath(import.meta.url), '..', '..', 'dist');
const buildDir = join(distDir, 'build');

// create the express server
const app = express();

// page and endpoint handler
app.use(qwikCity(render, cityPlan));

// static asset handlers
app.use(`/build`, express.static(buildDir, { immutable: true, maxAge: '1y', index: false }));
app.use(express.static(distDir, { index: false }));

// 404 handler
app.use(qwikCity404());

// start the express server
app.listen(3000, () => {
  /* eslint-disable */
  console.log(`http://localhost:3000/`);
});
