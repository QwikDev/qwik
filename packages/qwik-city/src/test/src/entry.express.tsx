import express from 'express';
import cityPlan from '@qwik-city-plan';
import { qwikCity } from '@builder.io/qwik-city/express';
import { render } from './entry.ssr';

const app = express();

app.use(qwikCity(render, cityPlan));

app.listen(8080, () => {
  /* eslint-disable */
  console.log(`http://localhost:8080/`);
});
