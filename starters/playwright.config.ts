import { expect } from '@playwright/test';
import type { Locator, PlaywrightTestConfig } from '@playwright/test';

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
    viewport: {
      width: 520,
      height: 600,
    },
  },
  testIgnore: /.*example.spec.tsx/,
  retries: 3,
  webServer: {
    command: 'pnpm tsm ./starters/dev-server.ts 3301',
    port: 3301,
    reuseExistingServer: !process.env.CI,
  },
};

export default config;
