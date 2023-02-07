/*
 * WHAT IS THIS FILE?
 *
 * It's the  entry point for the express server when building for production.
 *
 * Learn more about the cloudflare integration here:
 * - https://qwik.builder.io/integrations/deployments/node/
 *
 */
import { createQwikCity } from '@builder.io/qwik-city/middleware/node';
import qwikCityPlan from '@qwik-city-plan';
import render from './entry.ssr';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import compression from 'compression';

// Directories where the static assets are located
const distDir = join(fileURLToPath(import.meta.url), '..', '..', 'dist');
const buildDir = join(distDir, 'build');

// Allow for dynamic port
const PORT = process.env.PORT ?? 3000;

// Create the Qwik City express middleware
const { router, notFound } = createQwikCity({ render, qwikCityPlan });

// Create the express server
// https://expressjs.com/
const app = express();

// Enable gzip compression
app.use(compression());

// Static asset handlers
// https://expressjs.com/en/starter/static-files.html
app.use(`/build`, express.static(buildDir, { immutable: true, maxAge: '1y' }));
app.use(express.static(distDir, { redirect: false }));

// Use Qwik City's page and endpoint request handler
app.use(router);

// Use Qwik City's 404 handler
app.use(notFound);

// Start the express server
app.listen(PORT, () => {
  /* eslint-disable */
  console.log(`Server starter: http://localhost:${PORT}/`);
});
