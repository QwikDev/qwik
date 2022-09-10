import { qwikCity } from '@builder.io/qwik-city/middleware/express';
import express from 'express';
import { fileURLToPath } from 'url';
import { join } from 'path';
import render from './entry.ssr';

// Directories where the static assets are located
const distDir = join(fileURLToPath(import.meta.url), '..', '..', 'dist');
const buildDir = join(distDir, 'build');

// Create the Qwik City express middleware
const { router, notFound } = qwikCity(render);

// Create the express server
const app = express();

// Static asset handlers
app.use(`/build`, express.static(buildDir, { immutable: true, maxAge: '1y' }));
app.use(express.static(distDir, { redirect: false }));

// Use Qwik City's page and endpoint request handler
app.use(router);

// Use Qwik City's 404 handler
app.use(notFound);

// Start the express server
app.listen(8080, () => {
  /* eslint-disable */
  console.log(`http://localhost:8080/`);
});
