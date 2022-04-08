import { test, expect } from '@playwright/test';

test.describe('e2e', () => {
  test.describe('two-listeners', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/two-listeners');
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
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
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    test('should rerender without changes', async ({ page }) => {
      const SNAPSHOT = `<p>1</p><p>"hola"</p><p>{"a":{"thing":12},"b":"hola","c":123,"d":false,"e":true,"f":null,"h":[1,"string",false,{"hola":1},["hello"]]}</p><p>undefined</p><p>null</p><p>[1,2,"hola",{}]</p><p>true</p><p>false</p>`;
      const content = await page.locator('#static');
      expect(await content.innerHTML()).toEqual(SNAPSHOT);
      const btn = await page.locator('#rerender');
      expect(await btn.textContent()).toEqual('Rerender 0');

      // Click button
      await btn.click();
      await page.waitForTimeout(100);

      expect(await content.innerHTML()).toEqual(SNAPSHOT);
      expect(await btn.textContent()).toEqual('Rerender 1');

      // Click button
      await btn.click();
      await page.waitForTimeout(100);

      expect(await content.innerHTML()).toEqual(SNAPSHOT);
      expect(await btn.textContent()).toEqual('Rerender 2');
    });
  });

  test.describe('events', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/events');
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
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
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    test('should update count', async ({ page }) => {
      const content1 = await page.locator('#btn1');
      const content2 = await page.locator('#btn2');
      const content3 = await page.locator('#btn3');
      const btnCount = await page.locator('#btn-count');

      expect((await content1.innerText()).trim()).toEqual('Placeholder Start\nDEFAULT 0');
      expect((await content2.innerText()).trim()).toEqual('START 0');
      expect((await content3.innerText()).trim()).toEqual('Placeholder Start\nINSIDE THING 0');

      // Count
      await btnCount.click();
      await page.waitForTimeout(100);
      expect((await content1.innerText()).trim()).toEqual('Placeholder Start\nDEFAULT 1');
      expect((await content2.innerText()).trim()).toEqual('START 1');
      expect((await content3.innerText()).trim()).toEqual('Placeholder Start\nINSIDE THING 1');

      // Count
      await btnCount.click();
      await page.waitForTimeout(100);
      expect((await content1.innerText()).trim()).toEqual('Placeholder Start\nDEFAULT 2');
      expect((await content2.innerText()).trim()).toEqual('START 2');
      expect((await content3.innerText()).trim()).toEqual('Placeholder Start\nINSIDE THING 2');
    });

    test('should toggle buttons', async ({ page }) => {
      const content1 = await page.locator('#btn1');
      const content2 = await page.locator('#btn2');
      const content3 = await page.locator('#btn3');

      const btnToggleButtons = await page.locator('#btn-toggle-buttons');

      // btnToggleButtons
      await btnToggleButtons.click();
      await page.waitForTimeout(100);
      expect((await content1.innerText()).trim()).toEqual('Placeholder Start');
      expect((await content2.innerText()).trim()).toEqual('START 0');
      expect((await content3.innerText()).trim()).toEqual('Placeholder Start');

      // btnToggleButtons
      await btnToggleButtons.click();
      await page.waitForTimeout(100);
      expect((await content1.innerText()).trim()).toEqual('Placeholder Start\nDEFAULT 0');
      expect((await content2.innerText()).trim()).toEqual('START 0');
      expect((await content3.innerText()).trim()).toEqual('Placeholder Start\nINSIDE THING 0');
    });

    test('should toggle buttons with count', async ({ page }) => {
      const content1 = await page.locator('#btn1');
      const content2 = await page.locator('#btn2');
      const content3 = await page.locator('#btn3');

      const btnToggleButtons = await page.locator('#btn-toggle-buttons');
      const btnCount = await page.locator('#btn-count');

      // btnToggleButtons
      await btnToggleButtons.click();
      await page.waitForTimeout(100);
      expect((await content1.innerText()).trim()).toEqual('Placeholder Start');
      expect((await content2.innerText()).trim()).toEqual('START 0');
      expect((await content3.innerText()).trim()).toEqual('Placeholder Start');

      // btnToggleButtons
      await btnCount.click();
      await page.waitForTimeout(100);
      expect((await content1.innerText()).trim()).toEqual('Placeholder Start');
      expect((await content2.innerText()).trim()).toEqual('START 1');
      expect((await content3.innerText()).trim()).toEqual('Placeholder Start');

      // btnToggleButtons
      await btnToggleButtons.click();
      await page.waitForTimeout(100);
      expect((await content1.innerText()).trim()).toEqual('Placeholder Start\nDEFAULT 1');
      expect((await content2.innerText()).trim()).toEqual('START 1');
      expect((await content3.innerText()).trim()).toEqual('Placeholder Start\nINSIDE THING 1');

      // btnToggleButtons
      await btnToggleButtons.click();
      await page.waitForTimeout(100);
      expect((await content1.innerText()).trim()).toEqual('Placeholder Start');
      expect((await content2.innerText()).trim()).toEqual('START 1');
      expect((await content3.innerText()).trim()).toEqual('Placeholder Start');

      // btnToggleButtons
      await btnToggleButtons.click();
      await page.waitForTimeout(100);
      expect((await content1.innerText()).trim()).toEqual('Placeholder Start\nDEFAULT 1');
      expect((await content2.innerText()).trim()).toEqual('START 1');
      expect((await content3.innerText()).trim()).toEqual('Placeholder Start\nINSIDE THING 1');
    });

    test('should toggle content', async ({ page }) => {
      const content1 = await page.locator('#btn1');
      const content2 = await page.locator('#btn2');
      const content3 = await page.locator('#btn3');

      const btnToggleContent = await page.locator('#btn-toggle-content');
      const btnCount = await page.locator('#btn-count');

      // btnToggleButtons
      await btnToggleContent.click();
      await page.waitForTimeout(100);
      expect((await content1.innerText()).trim()).toEqual('Placeholder Start');
      expect((await content2.innerText()).trim()).toEqual('Placeholder Start');
      expect((await content3.innerText()).trim()).toEqual('Placeholder Start');

      // btnToggleButtons
      await btnCount.click();
      await btnToggleContent.click();
      await page.waitForTimeout(100);
      expect((await content1.innerText()).trim()).toEqual('Placeholder Start\nDEFAULT 1');
      expect((await content2.innerText()).trim()).toEqual('START 1');
      expect((await content3.innerText()).trim()).toEqual('Placeholder Start\nINSIDE THING 1');
    });

    test('should toggle thing + count', async ({ page }) => {
      const content1 = await page.locator('#btn1');
      const content2 = await page.locator('#btn2');
      const content3 = await page.locator('#btn3');

      const btnToggleThing = await page.locator('#btn-toggle-thing');
      const btnCount = await page.locator('#btn-count');

      // btnToggleButtons
      await btnToggleThing.click();
      await btnCount.click();
      await page.waitForTimeout(100);
      expect((await content1.innerText()).trim()).toEqual('Placeholder Start\nDEFAULT 1');
      expect((await content2.innerText()).trim()).toEqual('START 1');
      expect((await content3.innerText()).trim()).toEqual('');

      await btnToggleThing.click();
      await page.waitForTimeout(100);
      expect((await content1.innerText()).trim()).toEqual('Placeholder Start\nDEFAULT 1');
      expect((await content2.innerText()).trim()).toEqual('START 1');
      expect((await content3.innerText()).trim()).toEqual('Placeholder Start\nINSIDE THING 1');
    });
  });

  test.describe('factory', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/factory');
    });

    test('should render correctly', async ({ page }) => {
      const body = await page.locator('body');

      expect((await body.innerText()).trim()).toEqual('A\nB\nLight: wow!');
    });
  });
});
