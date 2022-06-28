import express from 'express';
import cityPlan from 'packages/qwik-city/runtime/qwik-city-plan';
import { qwikCity } from 'packages/qwik-city/adaptor/adaptors/express';
import { render } from './entry.ssr';

const app = express();

app.use(qwikCity(render, cityPlan));

app.listen(8080, () => {
  /* eslint-disable */
  console.log(`http://localhost:8080/`);
});
