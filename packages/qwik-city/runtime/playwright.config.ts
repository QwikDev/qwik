import type { PlaywrightTestConfig } from '@playwright/test';

const javaScriptEnabled = process.env.mode === 'spa';

const config: PlaywrightTestConfig = {
  use: {
    viewport: {
      width: 1200,
      height: 800,
    },
    javaScriptEnabled,
  },
  timeout: 5000,
  webServer: {
    command: 'node server/entry.express',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
};

export default config;
