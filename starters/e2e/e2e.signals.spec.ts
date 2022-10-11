import { test, expect } from '@playwright/test';

test.describe('signals', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/signals');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });

  test('should do its thing', async ({ page }) => {
    const incrementBtn = await page.locator('#count');
    const clickBtn = await page.locator('#click');
    const incrementIdBtn = await page.locator('#increment-id');
    const backgroundBtn = await page.locator('#background');

    const text = await page.locator('#text');
    const id = await page.locator('#id');
    const computed = await page.locator('#computed');
    const stuff = await page.locator('#stuff');
    const body = await page.locator('body');

    await page.waitForTimeout(100);
    await expect(text).toHaveText('Text: Message');
    await expect(text).toHaveAttribute('data-set', 'ref');
    await expect(id).toHaveText('Id: 0');
    await expect(computed).toHaveText('computed: ');
    await expect(stuff).toHaveText('Stuff: 10');
    await expect(stuff).toHaveAttribute('data-set', 'ref2');

    await incrementBtn.click();
    await expect(text).toHaveText('Text: Message');
    await expect(text).toHaveAttribute('data-set', 'ref');
    await expect(id).toHaveText('Id: 0');
    await expect(computed).toHaveText('computed: ');
    await expect(stuff).toHaveText('Stuff: 11');
    await expect(stuff).toHaveAttribute('data-set', 'ref2');

    await clickBtn.click();
    await expect(text).toHaveText('Text: Message');
    await expect(text).toHaveAttribute('data-set', 'ref');
    await expect(id).toHaveText('Id: 0');
    await expect(computed).toHaveText('computed: clicked');
    await expect(stuff).toHaveText('Stuff: 11');
    await expect(stuff).toHaveAttribute('data-set', 'ref2');

    await incrementIdBtn.click();
    await expect(text).toHaveText('Text: Message');
    await expect(text).toHaveAttribute('data-set', 'ref');
    await expect(id).toHaveText('Id: 1');
    await expect(computed).toHaveText('computed: clicked');
    await expect(stuff).toHaveText('Stuff: 11');
    await expect(stuff).toHaveAttribute('data-set', 'ref2');
    await expect(body).toHaveCSS('background-color', 'rgb(255, 255, 255)');

    await backgroundBtn.click();
    await expect(text).toHaveText('Text: Message');
    await expect(text).toHaveAttribute('data-set', 'ref');
    await expect(id).toHaveText('Id: 1');
    await expect(computed).toHaveText('computed: clicked');
    await expect(stuff).toHaveText('Stuff: 11');
    await expect(stuff).toHaveAttribute('data-set', 'ref2');
    await expect(body).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  });
});
