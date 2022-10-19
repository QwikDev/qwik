import { generate } from '@builder.io/qwik-city/static';
import qwikCityPlan from '@qwik-city-plan';
import render from './entry.ssr';

generate({ render, qwikCityPlan });
