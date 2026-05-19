import { defineConfig, devices } from '@playwright/test';

const TestingURL = 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: TestingURL,
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: process.env.CI ? 'node e2e/docs-e2e/serve-docs.ts' : 'pnpm -C ../.. docs.dev',
    cwd: process.env.CI ? '../..' : undefined,
    url: TestingURL,
    reuseExistingServer: !process.env.CI,
  },
});
