import type { PlaywrightTestConfig } from '@playwright/test';

// Runs the native-counter suite against the Rust SSR host. Build first:
//   pnpm node --require ./scripts/runBefore.ts e2e/qwik-e2e/native-build.ts
const config: PlaywrightTestConfig = {
  use: {
    baseURL: 'http://127.0.0.1:3312/native-counter/',
    viewport: { width: 520, height: 600 },
  },
  testMatch: 'native-counter.e2e.ts',
  retries: 1,
  expect: { timeout: 5000 },
  outputDir: '../../test-results/',
  webServer: {
    command:
      'cargo run -q --manifest-path packages/qwik/native/rust/Cargo.toml -p qwik-ssr-gen --bin qwik-native-project -- e2e/qwik-e2e/apps e2e/qwik-e2e/.native && cargo run --manifest-path e2e/qwik-e2e/.native/Cargo.toml 3312',
    port: 3312,
    reuseExistingServer: !process.env.CI,
    cwd: '../..',
  },
};

export default config;
