import type { Locator, PlaywrightTestConfig } from "@playwright/test";
import { expect } from "@playwright/test";

const inGithubCI = !!process.env.GITHUB_ACTIONS;

expect.extend({
  async hasAttribute(recieved: Locator, attribute: string) {
    const pass = await recieved.evaluate((node, attribute) => {
      return node.getAttribute(attribute);
    }, attribute);

    return {
      message: () =>
        `expected ${recieved} to have attribute \`${attribute}\` (${pass})`,
      pass: pass !== null,
    };
  },
});

const config: PlaywrightTestConfig = {
  use: {
    viewport: {
      width: 520,
      height: 600,
    },
  },
  fullyParallel: true,
  testMatch: "*.e2e.ts",
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  testIgnore: /.*example.spec.tsx?$/,
  retries: inGithubCI ? 0 : 1,
  expect: { timeout: inGithubCI ? 120000 : 10000 },
  webServer: {
    command:
      "pnpm node --require ./scripts/runBefore.ts starters/dev-server.ts 3301",
    port: 3301,
    reuseExistingServer: !process.env.CI,
  },
};

export default config;
