import { defineConfig, devices } from '@playwright/test';
import { APP_DIR, ORIGIN, PORT } from './utils/app';

export default defineConfig({
  testDir: './tests',
  testMatch: '*.e2e.ts',
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFileName}/{arg}{ext}',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 120_000,
  outputDir: '../../test-results/preloader',
  use: {
    baseURL: ORIGIN,
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
    viewport: { width: 1280, height: 800 },
    trace: process.env.CI ? 'retain-on-failure' : undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `pnpm exec qwik build preview && pnpm exec vite preview --port ${PORT} --strictPort`,
    cwd: APP_DIR,
    url: ORIGIN,
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    timeout: 600_000,
    stdout: 'ignore',
  },
});
