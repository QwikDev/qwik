import { defineConfig, devices } from '@playwright/test';

/** See https://playwright.dev/docs/test-configuration. */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'line',

  use: {
    baseURL: 'http://localhost:3000',
    // trace: 'on-first-retry',
    // screenshot: 'only-on-failure',

    // Increase timeouts for service worker operations
    actionTimeout: 10000,
    navigationTimeout: 10000,
  },

  // Increase global timeout for service worker tests
  timeout: 30000,

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: {
    command: 'npm run express',
    port: 3000,
    stdout: 'pipe',
    reuseExistingServer: !process.env.CI,
  },
});
