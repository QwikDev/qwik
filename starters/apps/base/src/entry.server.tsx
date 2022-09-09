import { qwikCity } from '@builder.io/qwik-city/middleware/express';
import polka from 'polka';
import sirv from 'sirv';
import { fileURLToPath } from 'url';
import { join } from 'path';
import render from './entry.ssr';

// directories where the static assets are located
const distDir = join(fileURLToPath(import.meta.url), '..', '..', 'dist');
const buildDir = join(distDir, 'build');

// create the Qwik City server middleware
const { router, notFound } = qwikCity(render);

// create the http server with polka
// https://github.com/lukeed/polka
const app = polka();

// static asset middleware with sirv
// https://github.com/lukeed/sirv
app.use(`/build`, sirv(buildDir, { immutable: true }));
app.use(sirv(distDir));

// use Qwik City's page and endpoint handler
app.use(router);

// use Qwik City's 404 handler
app.use(notFound);

// start the server
app.listen(8080, () => {
  /* eslint-disable */
  console.log(`http://localhost:8080/`);
});
