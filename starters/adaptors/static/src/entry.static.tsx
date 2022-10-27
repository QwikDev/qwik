import { generate } from '@builder.io/qwik-city/static';

generate({
  outDir: 'dist',
  origin: 'https://my-site.local',
  renderModulePath: './entry.ssr',
  qwikCityPlanModulePath: '@qwik-city-plan',
});
