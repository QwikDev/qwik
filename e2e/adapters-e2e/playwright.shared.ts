import type { PlaywrightTestConfig } from '@playwright/test';
import { devices } from '@playwright/test';

export const ADAPTER_BASE_URL = 'http://127.0.0.1:3000';

export const adapterPlaywrightConfig: PlaywrightTestConfig = {
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'line',

  use: {
    baseURL: ADAPTER_BASE_URL,
    actionTimeout: 10000,
    navigationTimeout: 10000,
  },

  timeout: process.env.CI ? 120000 : 30000,

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
};

export const createAdapterWebServerConfig = (command: string) => ({
  command,
  url: ADAPTER_BASE_URL,
  stdout: 'pipe' as const,
  reuseExistingServer: !process.env.CI,
  timeout: process.env.CI ? 120000 : 30000,
});
