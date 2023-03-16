import { test, expect } from '@playwright/test';

test.describe('events', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/events');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test('should rerender correctly', async ({ page }) => {
    const btnWrapped = page.locator('#btn-wrapped');
    const btnTransparent = page.locator('#btn-transparent');

    const contentTransparent = page.locator('#count-transparent');
    const countWrapped = page.locator('#count-wrapped');

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

  test('should prevent defaults and bubbling', async ({ page }) => {
    const prevented1 = page.locator('#prevent-default-1');
    const prevented2 = page.locator('#prevent-default-2');
    const countWrapped = page.locator('#count-anchor');

    await prevented1.click();
    await expect(countWrapped).toHaveText('countAnchor: 0');

    await prevented2.click();
    await expect(countWrapped).toHaveText('countAnchor: 1');
  });
});

test.describe('broadcast-events', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/broadcast-events');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  function tests() {
    test('should render correctly', async ({ page }) => {
      const document = page.locator('p.document');
      const document2 = page.locator('p.document2');

      const window = page.locator('p.window');
      const window2 = page.locator('p.window2');

      const self = page.locator('p.self');
      const self2 = page.locator('p.self2');

      await expect(document).toHaveText('(Document: x: 0, y: 0)');
      await expect(document2).toHaveText('(Document2: x: 0, y: 0)');
      await expect(window).toHaveText('(Window: x: 0, y: 0)');
      await expect(window2).toHaveText('(Window2: x: 0, y: 0)');
      await expect(self).toHaveText('(Host: x: 0, y: 0, inside: false)');
      await expect(self2).toHaveText('(Host2: x: 0, y: 0)');

      await page.mouse.move(100, 50);

      await expect(document).toHaveText('(Document: x: 100, y: 50)');
      await expect(document2).toHaveText('(Document2: x: 100, y: 50)');
      await expect(window).toHaveText('(Window: x: 100, y: 50)');
      await expect(window2).toHaveText('(Window2: x: 100, y: 50)');
      await expect(self).toHaveText('(Host: x: 0, y: 0, inside: false)');
      await expect(self2).toHaveText('(Host2: x: 0, y: 0)');

      await page.mouse.move(100, 300);

      await expect(document).toHaveText('(Document: x: 100, y: 300)');
      await expect(document2).toHaveText('(Document2: x: 100, y: 300)');
      await expect(window).toHaveText('(Window: x: 100, y: 300)');
      await expect(window2).toHaveText('(Window2: x: 100, y: 300)');
      await expect(self).toHaveText('(Host: x: 100, y: 300, inside: true)');
      await expect(self2).toHaveText('(Host2: x: 100, y: 300)');
    });
  }

  tests();

  test.describe('client rerender', () => {
    test.beforeEach(async ({ page }) => {
      const toggleRender = page.locator('#btn-toggle-render');
      await toggleRender.click();
      await page.waitForTimeout(100);
    });
    tests();
  });
});

test.describe('events client side', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/events-client');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test('should progressively listen to new events', async ({ page }) => {
    const link = page.locator('#link');
    const input = page.locator('#input');

    // it should do nothing, no navigate
    await link.click();

    await input.focus();

    const div = page.locator('#div');
    await expect(div).toHaveText('Text: ');
    await expect(div).toHaveClass('');

    await input.fill('Some text');
    await expect(div).toHaveText('Text: Some text');
    await expect(div).toHaveClass('');

    await div.hover();
    await expect(div).toHaveClass('isOver');
  });
});
