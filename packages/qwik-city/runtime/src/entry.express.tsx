import express from 'express';
import { fileURLToPath } from 'url';
import { join } from 'path';
import { qwikCity } from '../../middleware/express';
import render from './entry.ssr';

// directories where the static assets are located
const distDir = join(fileURLToPath(import.meta.url), '..', '..', 'dist');
const buildDir = join(distDir, 'build');

const { router, notFound } = qwikCity(render);

// create the express server
const app = express();

// page and endpoint handler
app.use(router);

// static asset handlers
app.use(`/build`, express.static(buildDir, { immutable: true, maxAge: '1y', index: false }));
app.use(express.static(distDir, { index: false }));

// 404 handler
app.use(notFound);

// start the express server
app.listen(3000, () => {
  /* eslint-disable */
  console.log(`http://localhost:3000/`);
});
