import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  use: {
    viewport: {
      width: 1200,
      height: 800,
    },
  },
  timeout: 5000,
  // workers: 1,
  // retries: 3,
  webServer: {
    command: 'node server/entry.express.js',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
};

export default config;
