import { defineConfig } from '@playwright/test';
import { adapterPlaywrightConfig, createAdapterWebServerConfig } from './playwright.shared';

// Build with a custom assets dir to cover assetsDir-aware static paths.
process.env.ADAPTERS_E2E_ASSETS_DIR = 'q';

export default defineConfig({
  ...adapterPlaywrightConfig,
  webServer: createAdapterWebServerConfig('npm run deno'),
});
