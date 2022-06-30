import express from 'express';
import { join } from 'path';
import cityPlan from '@qwik-city-plan';
import { qwikCity } from '@builder.io/qwik-city/adaptors/express';
import { render } from './entry.ssr';

const app = express();

app.use(
  qwikCity(render, {
    ...cityPlan,
    staticDir: join(__dirname, '..', 'dist'),
  })
);

app.listen(8080, () => {
  /* eslint-disable */
  console.log(`http://localhost:8080/`);
});
