import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  use: {
    viewport: {
      width: 520,
      height: 600,
    },
  },
  workers: 1,
  retries: 3,
  webServer: {
    command: 'node runtime/server/entry.express.js',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
};

export default config;
