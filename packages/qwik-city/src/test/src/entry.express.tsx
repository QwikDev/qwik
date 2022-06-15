import express from 'express';
import { qwikCity } from '@builder.io/qwik-city/express';
import { manifest, routes } from '@qwik-city-app';
import Root from './root';
import { join } from 'path';

const app = express();

app.use(qwikCity(<Root />, { manifest, routes, staticDir: join(__dirname, 'dist') }));

app.listen(8080, () => {
  /* eslint-disable */
  console.log(`http://localhost:8080/`);
});
