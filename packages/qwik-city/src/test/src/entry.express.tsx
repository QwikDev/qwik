import express from 'express';
import { qwikCity } from '@builder.io/qwik-city/express';
import { routes } from '@qwik-city-app';
import { render } from './entry.ssr';

const app = express();

app.use(qwikCity(render, { routes }));

app.listen(8080, () => {
  /* eslint-disable */
  console.log(`http://localhost:8080/`);
});
