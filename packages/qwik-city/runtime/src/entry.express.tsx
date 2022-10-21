import express from 'express';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { qwikCity } from '../../middleware/node';
import render from './entry.ssr';

// Directories where the static assets are located
const distDir = join(fileURLToPath(import.meta.url), '..', '..', 'dist');
const buildDir = join(distDir, 'build');

// Create the Qwik City express middleware
const { router, notFound } = qwikCity(render);
// Allow for dynamic port
const PORT = process.env.PORT ?? 3000;
// Create the express server
const app = express();

// Static asset handlers
app.use(`/build`, express.static(buildDir, { immutable: true, maxAge: '1y' }));
app.use(express.static(distDir, { redirect: false }));

// Use Qwik City's page and endpoint handler
app.use(router);

// Use Qwik City's 404 handler
app.use(notFound);

// Start the express server
app.listen(PORT, () => {
  /* eslint-disable */
  console.log(`http://localhost:${PORT}/`);
});
