import { existsSync, rmSync } from 'node:fs';

const locations = [
  'packages/qwik/dist/',
  'packages/qwik-router/lib/',
  'packages/docs/dist/',
  'packages/insights/dist/',
];

for (const location of locations) {
  if (existsSync(location)) {
    rmSync(location, { recursive: true, force: true });
  }
}
