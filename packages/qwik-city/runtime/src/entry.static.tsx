import { qwikCityGenerate } from '../../static/node';
import render from './entry.ssr';
import { fileURLToPath } from 'url';
import { join } from 'path';

// Location where the static html files should be written
const ourDir = join(fileURLToPath(import.meta.url), '..', '..', 'dist');

// Execute Qwik City Static Generator
qwikCityGenerate(render, {
  ourDir,
  baseUrl: 'https://qwik.builder.io/',
  log: 'debug',
});
