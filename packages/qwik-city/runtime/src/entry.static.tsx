import { generate } from '../../static';
import qwikCityPlan from '@qwik-city-plan';
import render from './entry.ssr';
import { fileURLToPath } from 'url';
import { join } from 'path';

// Execute Qwik City Static Generator
generate({
  render,
  qwikCityPlan,
  origin: 'https://qwik.builder.io',
  outDir: join(fileURLToPath(import.meta.url), '..', '..', 'dist'),
  log: 'debug',
  currentFile: import.meta.url,
});
