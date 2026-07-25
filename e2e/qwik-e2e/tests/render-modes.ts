import { expect, test } from '@playwright/test';

export type RenderMode = 'ssr' | 'client';

export const describeRenderModes = (
  pathname: string,
  registerTests: (mode: RenderMode) => void
) => {
  for (const mode of ['ssr', 'client'] as const) {
    test.describe(mode, () => {
      test.beforeEach(async ({ page }) => {
        page.on('pageerror', (error) => expect(error).toEqual(undefined));
        page.on('console', (message) => {
          if (message.type() === 'error') {
            expect(message.text()).toEqual(undefined);
          }
        });
        await page.goto(`${pathname}${mode === 'client' ? '?csr=1' : ''}`);
      });

      registerTests(mode);
    });
  }
};
