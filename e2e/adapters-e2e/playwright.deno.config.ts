import { defineConfig } from '@playwright/test';
import { adapterPlaywrightConfig, createAdapterWebServerConfig } from './playwright.shared';

// The deno variant builds with a custom assets dir to cover assetsDir-aware
// static paths through the isStaticPath-gated staticFile middleware.
process.env.ADAPTERS_E2E_ASSETS_DIR = 'q';

export default defineConfig({
  ...adapterPlaywrightConfig,
  webServer: createAdapterWebServerConfig('npm run deno'),
});
