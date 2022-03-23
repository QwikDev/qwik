import { test, expect } from '@playwright/test';

test.describe('e2e', () => {
  test.describe('two-listeners', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/two-listeners');
    });

    test('should support two QRLs on event', async ({ page }) => {
      const button = page.locator('button.two-listeners');
      await button.click();
      await expect(button).toContainText('2 / 2');
    });
  });

  test.describe('lexical-scope', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/lexical-scope');
    });

    test('should rerender without changes', async ({ page }) => {
      const content = await page.locator('#static');
      expect(await content.innerHTML()).toMatchSnapshot({name: 'lexical-scope-static'})
      const btn = await page.locator('#rerender');
      expect(await btn.textContent()).toEqual('Rerender 0');


      // Click button
      await btn.click();
      await page.waitForTimeout(100);

      expect(await content.innerHTML()).toMatchSnapshot({name: 'lexical-scope-static'})
      expect(await btn.textContent()).toEqual('Rerender 1');

      // Click button
      await btn.click();
      await page.waitForTimeout(100);

      expect(await content.innerHTML()).toMatchSnapshot({name: 'lexical-scope-static'})
      expect(await btn.textContent()).toEqual('Rerender 2');
    });
  });


  test.describe('events', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/events');
    });

    test('should rerender correctly', async ({ page }) => {
      const btnWrapped = await page.locator('#btn-wrapped');
      const btnTransparent = await page.locator('#btn-transparent');

      const contentTransparent = await page.locator('#count-transparent');
      const countWrapped = await page.locator('#count-wrapped');

      expect(await contentTransparent.textContent()).toEqual('countTransparent: 0');
      expect(await countWrapped.textContent()).toEqual('countWrapped: 0');
      expect(await btnWrapped.textContent()).toEqual('Wrapped 0');


      // Click wrapped
      await btnWrapped.click();
      await page.waitForTimeout(100);
      expect(await contentTransparent.textContent()).toEqual('countTransparent: 0');
      expect(await countWrapped.textContent()).toEqual('countWrapped: 1');
      expect(await btnWrapped.textContent()).toEqual('Wrapped 1');

      // Click wrapped
      await btnWrapped.click();
      await page.waitForTimeout(100);
      expect(await contentTransparent.textContent()).toEqual('countTransparent: 0');
      expect(await countWrapped.textContent()).toEqual('countWrapped: 2');
      expect(await btnWrapped.textContent()).toEqual('Wrapped 2');

      // Click transparent
      await btnTransparent.click();
      await page.waitForTimeout(100);
      expect(await contentTransparent.textContent()).toEqual('countTransparent: 1');
      expect(await countWrapped.textContent()).toEqual('countWrapped: 2');
      expect(await btnWrapped.textContent()).toEqual('Wrapped 2');

      // Click transparent
      await btnTransparent.click();
      await page.waitForTimeout(100);
      expect(await contentTransparent.textContent()).toEqual('countTransparent: 2');
      expect(await countWrapped.textContent()).toEqual('countWrapped: 2');
      expect(await btnWrapped.textContent()).toEqual('Wrapped 2');
    });
  });

  test.describe('slot', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/slot');
    });

  });
});
