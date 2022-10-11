import { test, expect } from '@playwright/test';

test.describe('slot', () => {
  function tests() {
    test('should update count', async ({ page }) => {
      const content1 = await page.locator('#btn1');
      const content2 = await page.locator('#btn2');
      const content3 = await page.locator('#btn3');
      const btnCount = await page.locator('#btn-count');

      await expect(content1).toHaveText('DEFAULT 0');
      await expect(content2).toHaveText('START 0');
      await expect(content3).toHaveText('INSIDE THING 0');

      // Count
      await btnCount.click();
      await page.waitForTimeout(100);
      await expect(content1).toHaveText('DEFAULT 1');
      await expect(content2).toHaveText('START 1');
      await expect(content3).toHaveText('INSIDE THING 1');

      // Count
      await btnCount.click();
      await page.waitForTimeout(100);
      await expect(content1).toHaveText('DEFAULT 2');
      await expect(content2).toHaveText('START 2');
      await expect(content3).toHaveText('INSIDE THING 2');
    });

    test('should toggle buttons', async ({ page }) => {
      const content1 = await page.locator('#btn1');
      const content2 = await page.locator('#btn2');
      const content3 = await page.locator('#btn3');

      const btnToggleButtons = await page.locator('#btn-toggle-buttons');

      // btnToggleButtons
      await page.waitForTimeout(100);
      await btnToggleButtons.click();
      await page.waitForTimeout(100);
      await expect(content1).toHaveText('', { useInnerText: true });
      await expect(content2).toHaveText('START 0', { useInnerText: true });
      await expect(content3).toHaveText('', { useInnerText: true });

      // btnToggleButtons
      await btnToggleButtons.click();
      await page.waitForTimeout(100);
      await expect(content1).toHaveText('DEFAULT 0', { useInnerText: true });
      await expect(content2).toHaveText('START 0', { useInnerText: true });
      await expect(content3).toHaveText('INSIDE THING 0', { useInnerText: true });
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
      await expect(content1).toHaveText('', { useInnerText: true });
      await expect(content2).toHaveText('START 0', { useInnerText: true });
      await expect(content3).toHaveText('', { useInnerText: true });

      // btnToggleButtons
      await btnCount.click();
      await page.waitForTimeout(100);
      await expect(content1).toHaveText('', { useInnerText: true });
      await expect(content2).toHaveText('START 1', { useInnerText: true });
      await expect(content3).toHaveText('', { useInnerText: true });

      // btnToggleButtons
      await btnToggleButtons.click();
      await page.waitForTimeout(100);
      await expect(content1).toHaveText('DEFAULT 1', { useInnerText: true });
      await expect(content2).toHaveText('START 1', { useInnerText: true });
      await expect(content3).toHaveText('INSIDE THING 1', { useInnerText: true });

      // btnToggleButtons
      await btnToggleButtons.click();
      await page.waitForTimeout(100);
      await expect(content1).toHaveText('', { useInnerText: true });
      await expect(content2).toHaveText('START 1', { useInnerText: true });
      await expect(content3).toHaveText('', { useInnerText: true });

      // btnToggleButtons
      await btnToggleButtons.click();
      await page.waitForTimeout(100);
      await expect(content1).toHaveText('DEFAULT 1', { useInnerText: true });
      await expect(content2).toHaveText('START 1', { useInnerText: true });
      await expect(content3).toHaveText('INSIDE THING 1', { useInnerText: true });
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
      await expect(content1).toHaveText('', { useInnerText: true });
      await expect(content2).toHaveText('', { useInnerText: true });
      await expect(content3).toHaveText('', { useInnerText: true });

      // btnToggleButtons
      await btnCount.click();
      await btnToggleContent.click();
      await page.waitForTimeout(100);
      await expect(content1).toHaveText('DEFAULT 1', { useInnerText: true });
      await expect(content2).toHaveText('START 1', { useInnerText: true });
      await expect(content3).toHaveText('INSIDE THING 1', { useInnerText: true });
    });

    test('should toggle content and buttons', async ({ page }) => {
      const content1 = await page.locator('#btn1');
      const content2 = await page.locator('#btn2');
      const content3 = await page.locator('#btn3');

      const btnToggleButtons = await page.locator('#btn-toggle-buttons');
      const btnToggleContent = await page.locator('#btn-toggle-content');

      // btnToggleButtons
      await btnToggleButtons.click();
      await page.waitForTimeout(100);
      await btnToggleContent.click();
      await page.waitForTimeout(100);
      await btnToggleButtons.click();

      await expect(content1).toHaveText('', { useInnerText: true });
      await expect(content2).toHaveText('', { useInnerText: true });
      await expect(content3).toHaveText('', { useInnerText: true });
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
      await expect(content1).toHaveText('DEFAULT 1');
      await expect(content2).toHaveText('START 1');
      await expect(content3).toHaveText('');

      await btnToggleThing.click();
      await page.waitForTimeout(100);
      await expect(content1).toHaveText('DEFAULT 1');
      await expect(content2).toHaveText('START 1');
      await expect(content3).toHaveText('INSIDE THING 1');
    });

    test('should not lose q context', async ({ page }) => {
      const content3 = await page.locator('#btn3');
      const projected = await page.locator('#projected');
      const btnToggleThing = await page.locator('#btn-toggle-thing');
      const btnCount = await page.locator('#btn-count');

      await btnCount.click();
      await page.waitForTimeout(100);
      await expect(content3).toHaveText('INSIDE THING 1', { useInnerText: true });

      // btnToggleButtons
      await btnToggleThing.click();
      await page.waitForTimeout(100);
      await btnToggleThing.click();
      await page.waitForTimeout(100);

      // Click projected
      await projected.click();
      await page.waitForTimeout(100);

      await expect(content3).toHaveText('INSIDE THING 0', { useInnerText: true });
    });

    test('should project cmp correctly into their selected slot', async ({ page }) => {
      const toggleBtn = await page.locator('#toggle-child-slot');
      const slotChild = await page.locator('#slot-child');
      const slotP = await page.locator('#slot-p');
      const noslotP = await page.locator('#noslot-p');

      await expect(slotChild).not.toBeHidden();
      await expect(slotP).not.toBeHidden();
      await expect(noslotP).not.toBeHidden();

      await toggleBtn.click();

      await expect(slotChild).not.toBeHidden();
      await expect(slotP).not.toBeHidden();
      await expect(noslotP).toBeHidden();
    });

    test('should toggle nested slot', async ({ page }) => {
      const toggleBtn = await page.locator('#toggle-modal');
      const modalContent = await page.locator('#modal-content');

      await expect(modalContent).not.toBeHidden();

      await toggleBtn.click();
      await expect(modalContent).toBeHidden();

      await toggleBtn.click();
      await expect(modalContent).not.toBeHidden();
    });
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/slot');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });

  tests();

  test.describe('client rerender', () => {
    test.beforeEach(async ({ page }) => {
      const toggleRender = await page.locator('#btn-toggle-render');
      await toggleRender.click();
      await page.waitForTimeout(100);
      await toggleRender.click();
      await page.waitForTimeout(100);
    });
    tests();
  });
});
