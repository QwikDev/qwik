import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'url';

test.describe('actions', () => {
  test.describe('mpa', () => {
    test.use({ javaScriptEnabled: false });
    tests();
  });

  test.describe('spa', () => {
    test.use({ javaScriptEnabled: true });
    tests();
  });

  function tests() {
    test.describe('login form', () => {
      test.beforeEach(async ({ page }) => {
        await page.goto('/qwikcity-test/actions/');
      });

      test('should run actions programatically', async ({ page, javaScriptEnabled }) => {
        if (javaScriptEnabled) {
          const success = page.locator('#other-success');
          const btn = page.locator('#other-button');

          await expect(success).toBeHidden();
          await btn.click();
          await expect(success).toHaveText('Success');
          await expect(page.locator('#other-store')).toHaveText('false:::{"success":true}');
        }
      });

      test('should run actions', async ({ page, javaScriptEnabled }) => {
        const other = page.locator('#other-store');
        const running = page.locator('#running');
        const errorMessage = page.locator('#form-error');
        const successMessage = page.locator('#form-success');
        const username = page.locator('#label-username > input');
        const usernameError = page.locator('#label-username > p');
        const code = page.locator('#label-code > input');
        const codeError = page.locator('#label-code > p');
        const submit = page.locator('#submit');

        await expect(other).toHaveText('false:::');
        await submit.click();
        await expect(usernameError).toHaveText('String must contain at least 3 character(s)');
        await expect(codeError).toBeHidden();
        await expect(other).toHaveText('false:::');

        await username.fill('Manuel');
        await code.fill('text');
        await submit.click();
        await expect(usernameError).toBeHidden();
        await expect(codeError).toHaveText('Expected number, received nan');
        await expect(username).toHaveValue('Manuel');
        await expect(code).toHaveValue('text');
        await expect(other).toHaveText('false:::');

        await username.clear();
        await username.fill('Ma');
        await submit.click();
        await expect(usernameError).toHaveText('String must contain at least 3 character(s)');
        await expect(codeError).toHaveText('Expected number, received nan');
        await expect(username).toHaveValue('Ma');
        await expect(code).toHaveValue('text');
        await expect(other).toHaveText('false:::');

        await username.clear();
        await username.fill('Test');
        await code.clear();
        await code.fill('123');
        await submit.click();
        await expect(usernameError).toBeHidden();
        await expect(codeError).toBeHidden();
        await expect(username).toHaveValue('Test');
        await expect(code).toHaveValue('123');
        await expect(errorMessage).toHaveText('Invalid username or code');
        await expect(other).toHaveText('false:::');

        await username.clear();
        await username.fill('admin');
        await submit.click();
        if (javaScriptEnabled) {
          await expect(running).toHaveText('Running...');
        }
        await page.waitForTimeout(2500);
        await expect(running).toBeHidden();
        await expect(errorMessage).toBeHidden();
        await expect(successMessage).toHaveText('this is the secret');
        await expect(other).toHaveText('false:::');

        await username.clear();
        await username.fill('redirect');
        await submit.click();
        await page.waitForTimeout(200);
        expect(new URL(page.url()).pathname).toEqual('/qwikcity-test/');
      });
    });

    test.describe('issue2644', () => {
      test('should submit items', async ({ page }) => {
        await page.goto('/qwikcity-test/issue2644/');
        await page.locator('#issue2644-input').fill('AAA');
        await page.locator('#issue2644-submit').click();
        await page.waitForTimeout(200);

        const pageUrl = new URL(page.url());
        await expect(pageUrl.pathname).toBe('/qwikcity-test/issue2644/other/');
        await expect(page.locator('#issue2644-list > li')).toHaveText(['AAA']);

        await page.locator('#issue2644-input').fill('BBB');
        await page.locator('#issue2644-submit').click();
        await expect(pageUrl.pathname).toBe('/qwikcity-test/issue2644/other/');

        await expect(page.locator('#issue2644-list > li')).toHaveText(['AAA', 'BBB']);
      });
    });
  }
});
