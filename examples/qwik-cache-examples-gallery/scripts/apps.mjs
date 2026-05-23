import { resolve } from 'node:path';

export const repoRoot = resolve(import.meta.dirname, '..', '..', '..');

export const apps = [
  ['gallery', 'examples/qwik-cache-examples-gallery', 4300],
  ['commerce', 'examples/qwik-cache-commerce-app', 4311],
  ['dashboard', 'examples/qwik-cache-dashboard-app', 4312],
  ['partial-router', 'examples/qwik-partial-router-app', 4313],
  ['torture', 'examples/qwik-cache-torture-app', 4314],
  ['component-host', 'examples/qwik-component-host-app', 4315],
  ['small-cache', 'examples/qwik-cache-registry-app', 4321],
  ['qcomponent', 'examples/qwik-qcomponent-partials-app', 4322],
  ['partial-nav', 'examples/qwik-partial-navigation-app', 4323],
];

export const resolveAppDir = (dir) => resolve(repoRoot, dir);
