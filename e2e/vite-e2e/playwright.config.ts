import { defineConfig } from '@playwright/test';
import { join } from 'node:path';
import { variants } from './variants';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'line',
  workers: process.env.CI ? 1 : undefined,
  timeout: process.env.CI ? 60000 : 30000,
  use: {
    actionTimeout: 10000,
  },
  projects: variants.map((variant) => ({
    name: variant.slug,
    use: {
      baseURL: `http://127.0.0.1:${variant.port}`,
    },
  })),
  webServer: variants.map((variant) => ({
    command: `node --experimental-strip-types ${join(
      process.cwd(),
      'e2e',
      'vite-e2e',
      'build-variant.ts'
    )} ${variant.slug} && node ${join(
      process.cwd(),
      'e2e',
      'vite-e2e',
      'output',
      variant.slug,
      'server',
      'entry.express.js'
    )}`,
    port: variant.port,
    stdout: 'pipe',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 120000 : 60000,
    env: {
      ...process.env,
      PORT: String(variant.port),
    },
  })),
});
