import type { Locator, PlaywrightTestConfig } from '@playwright/test';
import { expect } from '@playwright/test';

const inGithubCI = !!process.env.GITHUB_ACTIONS;

expect.extend({
  async hasAttribute(recieved: Locator, attribute: string) {
    const pass = await recieved.evaluate((node, attribute) => {
      return node.getAttribute(attribute);
    }, attribute);

    return {
      message: () => `expected ${recieved} to have attribute \`${attribute}\` (${pass})`,
      pass: pass !== null,
    };
  },
});

const config: PlaywrightTestConfig = {
  use: {
    ...(!inGithubCI || process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? {
          launchOptions: {
            slowMo: inGithubCI ? undefined : 100,
            executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
          },
        }
      : {}),
    viewport: {
      width: 520,
      height: 600,
    },
    trace: inGithubCI ? 'on-first-retry' : undefined,
    screenshot: inGithubCI ? 'only-on-failure' : undefined,
  },
  fullyParallel: true,
  testMatch: '*.e2e.ts',
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  testIgnore: /.*example.spec.tsx?$/,
  // Locally a failure is a result, not something to wait out or paper over with a rerun.
  timeout: inGithubCI ? 30000 : 10000,
  retries: inGithubCI ? 1 : 0,
  expect: { timeout: inGithubCI ? 120000 : 3000 },
  outputDir: '../../test-results/',
  webServer: {
    command: 'pnpm node --require ./scripts/runBefore.ts e2e/qwik-e2e/dev-server.ts 3301',
    port: 3301,
    reuseExistingServer: !process.env.CI,
    cwd: '../..',
  },
};

export default config;
