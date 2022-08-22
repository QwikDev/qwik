import { qwikCity } from '@builder.io/qwik-city/middleware/express';
import express from 'express';
import { fileURLToPath } from 'url';
import { join } from 'path';
import render from './entry.ssr';

// directories where the static assets are located
const distDir = join(fileURLToPath(import.meta.url), '..', '..', 'dist');
const buildDir = join(distDir, 'build');

// create the Qwik City express middleware
const { router, notFound } = qwikCity(render);

// create the express server
const app = express();

// static asset handlers
app.use(`/build`, express.static(buildDir, { immutable: true, maxAge: '1y' }));
app.use(express.static(distDir, { redirect: false }));

// use Qwik City's page and endpoint handler
app.use(router);

// use Qwik City's 404 handler
app.use(notFound);

// start the express server
app.listen(8080, () => {
  /* eslint-disable */
  console.log(`http://localhost:8080/`);
});
