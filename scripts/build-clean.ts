import { existsSync, rmSync } from 'node:fs';

const locations = [
  'packages/qwik/dist/',
  'packages/qwik-city/lib/',
  'packages/docs/dist/',
  'packages/insights/dist/',
  'packages/qwik-labs/lib/',
  'packages/qwik-labs/vite/',
];

for (const location of locations) {
  if (existsSync(location)) {
    rmSync(location, { recursive: true, force: true });
  }
}
