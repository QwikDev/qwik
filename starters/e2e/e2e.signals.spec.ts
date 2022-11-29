import { test, expect } from '@playwright/test';

test.describe('signals', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/signals');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });

  test('should do its thing', async ({ page }) => {
    const incrementBtn = page.locator('#count');
    const clickBtn = page.locator('#click');
    const incrementIdBtn = page.locator('#increment-id');
    const backgroundBtn = page.locator('#background');

    const parentRender = page.locator('#parent-renders');
    const childRender = page.locator('#child-renders');

    const text = page.locator('#text');
    const id = page.locator('#id');
    const computed = page.locator('#computed');
    const stuff = page.locator('#stuff');
    const body = page.locator('body');

    await page.waitForTimeout(100);

    await expect(parentRender).toHaveText('Parent renders: 1');
    await expect(childRender).toHaveText('Child renders: 1');
    await expect(text).toHaveText('Text: Message');
    await expect(text).toHaveAttribute('data-set', 'ref');
    await expect(id).toHaveText('Id: 0');
    await expect(computed).toHaveText('computed: ');
    await expect(stuff).toHaveText('Stuff: 10');
    await expect(stuff).toHaveAttribute('data-set', 'ref2');

    await incrementBtn.click();
    await expect(parentRender).toHaveText('Parent renders: 1');
    await expect(childRender).toHaveText('Child renders: 1');
    await expect(text).toHaveText('Text: Message');
    await expect(text).toHaveAttribute('data-set', 'ref');
    await expect(id).toHaveText('Id: 0');
    await expect(computed).toHaveText('computed: ');
    await expect(stuff).toHaveText('Stuff: 11');
    await expect(stuff).toHaveAttribute('data-set', 'ref2');

    await clickBtn.click();
    await expect(parentRender).toHaveText('Parent renders: 1');
    await expect(childRender).toHaveText('Child renders: 2');
    await expect(text).toHaveText('Text: Message');
    await expect(text).toHaveAttribute('data-set', 'ref');
    await expect(id).toHaveText('Id: 0');
    await expect(computed).toHaveText('computed: clicked');
    await expect(stuff).toHaveText('Stuff: 11');
    await expect(stuff).toHaveAttribute('data-set', 'ref2');

    await incrementIdBtn.click();
    await expect(parentRender).toHaveText('Parent renders: 1');
    await expect(childRender).toHaveText('Child renders: 2');
    await expect(text).toHaveText('Text: Message');
    await expect(text).toHaveAttribute('data-set', 'ref');
    await expect(id).toHaveText('Id: 1');
    await expect(computed).toHaveText('computed: clicked');
    await expect(stuff).toHaveText('Stuff: 11');
    await expect(stuff).toHaveAttribute('data-set', 'ref2');
    await expect(body).toHaveCSS('background-color', 'rgb(255, 255, 255)');

    await backgroundBtn.click();
    await expect(parentRender).toHaveText('Parent renders: 1');
    await expect(childRender).toHaveText('Child renders: 2');
    await expect(text).toHaveText('Text: Message');
    await expect(text).toHaveAttribute('data-set', 'ref');
    await expect(id).toHaveText('Id: 1');
    await expect(computed).toHaveText('computed: clicked');
    await expect(stuff).toHaveText('Stuff: 11');
    await expect(stuff).toHaveAttribute('data-set', 'ref2');
    await expect(body).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  });

  test('issue 1681', async ({ page }) => {
    const result = page.locator('#issue-1681-return');
    const button = page.locator('#issue-1681-btn');

    await expect(result).toHaveText('Count A is 0 Count B is 0');
    await button.click();
    await expect(result).toHaveText('Count A is 1 Count B is 1');
  });

  test('issue 1733', async ({ page }) => {
    const button = page.locator('#issue1733-btn');
    const spanSignal = page.locator('#issue1733-signal');
    const spanTrue = page.locator('#issue1733-true');
    const spanFalse = page.locator('#issue1733-false');
    const h1 = page.locator('#issue1733-h1');

    await expect(spanSignal).toHaveText('');
    await expect(spanTrue).toHaveText('');
    await expect(spanFalse).toHaveText('');
    await expect(h1).not.toBeVisible();

    await button.click();

    await expect(spanSignal).toHaveText('');
    await expect(spanTrue).toHaveText('');
    await expect(spanFalse).toHaveText('');
    await expect(h1).toBeVisible();
    await expect(h1).toHaveText('Message');
  });

  test('issue 1884', async ({ page }) => {
    const button = page.locator('#issue1884-btn');
    const text0 = page.locator('.issue1884-text:nth-child(1)');
    const text1 = page.locator('.issue1884-text:nth-child(2)');
    const text2 = page.locator('.issue1884-text:nth-child(3)');
    const text3 = page.locator('.issue1884-text:nth-child(4)');

    await expect(text0).toHaveCSS('color', 'rgb(0, 0, 0)');
    await expect(text1).toHaveCSS('color', 'rgb(0, 0, 0)');
    await expect(text2).toHaveCSS('color', 'rgb(0, 0, 0)');
    await expect(text3).toHaveCSS('color', 'rgb(0, 0, 0)');

    await button.click();

    await expect(text0).toHaveCSS('color', 'rgb(255, 0, 0)');
    await expect(text1).toHaveCSS('color', 'rgb(255, 0, 0)');
    await expect(text2).toHaveCSS('color', 'rgb(255, 0, 0)');
    await expect(text3).toHaveCSS('color', 'rgb(255, 0, 0)');
  });

  test('issue 2000', async ({ page }) => {
    const textArea = page.locator('textarea');
    await expect(textArea).toHaveText('body { background: white}');
  });

  test('issue 2176', async ({ page }) => {
    const btn = page.locator('#issue-2176-btn');
    const results = page.locator('.issue-2176-result');
    await expect(results).toHaveText([
      'testing flag=F num=1',
      'testing flag=F num=1',
      'testing flag=F num=1',
      'testing flag=F num=1',
      'testing flag=F num=1',
      'testing flag=F num=1',
      'testing flag=F num=1',
      'testing flag=F num=1',
      'testing flag=F num=1',
      'testing flag=F num=1',
      'testing flag=F num=1',
      'testing flag=F num=1',
    ]);

    await btn.click();
    await expect(results).toHaveText([
      'testing2 flag=T num=2',
      'testing2 flag=T num=2',
      'testing2 flag=T num=2',
      'testing2 flag=T num=2',
      'testing2 flag=T num=2',
      'testing2 flag=T num=2',
      'testing2 flag=T num=2',
      'testing2 flag=T num=2',
      'testing2 flag=T num=2',
      'testing2 flag=T num=2',
      'testing2 flag=T num=2',
      'testing2 flag=T num=2',
    ]);

    await btn.click();
    await expect(results).toHaveText([
      'testing3 flag=F num=3',
      'testing3 flag=F num=3',
      'testing3 flag=F num=3',
      'testing3 flag=F num=3',
      'testing3 flag=F num=3',
      'testing3 flag=F num=3',
      'testing3 flag=F num=3',
      'testing3 flag=F num=3',
      'testing3 flag=F num=3',
      'testing3 flag=F num=3',
      'testing3 flag=F num=3',
      'testing3 flag=F num=3',
    ]);
  });

  test('issue 2245', async ({ page }) => {
    const btn = page.locator('#issue-2245-btn');
    const results = page.locator('.issue-2245-results p');
    expect(await results.count()).toBe(16);
    for (let i = 0; i < 16; i++) {
      await expect(results.nth(i)).toHaveCSS('color', 'rgb(0, 0, 0)');
    }

    await btn.click();
    for (let i = 0; i < 16; i++) {
      await expect(results.nth(i)).toHaveCSS('color', 'rgb(255, 0, 0)');
    }

    await btn.click();
    for (let i = 0; i < 16; i++) {
      await expect(results.nth(i)).toHaveCSS('color', 'rgb(0, 0, 255)');
    }
  });

  test('issue 2245-b', async ({ page }) => {
    const btn = page.locator('#issue-2245-b-btn');
    const results = page.locator('.issue-2245-b-results p');
    await expect(results).toHaveCSS('color', 'rgb(0, 0, 0)');

    await btn.click();
    await expect(results).toHaveCSS('color', 'rgb(255, 0, 0)');

    await btn.click();
    await expect(results).toHaveCSS('color', 'rgb(0, 0, 255)');
  });

  test('complex classes with signals', async ({ page }) => {
    const btn = page.locator('#complex-classes-btn');
    const results = page.locator('#complex-classes-results');

    await expect(results).toHaveClass('initial visible');
    await btn.click();
    await expect(results).toHaveClass('change hidden');
  });

  test('issue 2311', async ({ page }) => {
    const btn = page.locator('#issue-2311-btn');
    const results = page.locator('#issue-2311-results > *');
    await expect(results).toHaveText([
      'This text should not change',
      'Hello',
      'This text should not change',
      'Hello',
      'This text should not change',
      'Hello',
      'This text should not change',
      'Hello',
      'This text should not change',
      'Hello',
    ]);

    await btn.click();

    await expect(results).toHaveText([
      'This text should not change',
      'Done!',
      'This text should not change',
      'Done!',
      'This text should not change',
      'Done!',
      'This text should not change',
      'Done!',
      'This text should not change',
      'Done!',
    ]);
  });
});
