import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  use: {
    viewport: {
      width: 520,
      height: 600,
    },
  },
  retries: 3,
  webServer: {
    command: 'node -r esbuild-register starters/dev-server.ts 3301',
    port: 3301,
    reuseExistingServer: !process.env.CI,
  },
};

export default config;
