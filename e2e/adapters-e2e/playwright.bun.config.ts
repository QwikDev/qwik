import { defineConfig } from '@playwright/test';
import { adapterPlaywrightConfig, createAdapterWebServerConfig } from './playwright.shared';

export default defineConfig({
  ...adapterPlaywrightConfig,
  webServer: createAdapterWebServerConfig('npm run bun'),
});
