import { test, expect } from '@playwright/test';

test.describe('context', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/context');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });

  test('should load', async ({ page }) => {
    const level2State1 = await page.locator('.level2-state1');
    const level2State2 = await page.locator('.level2-state2');
    const level2SSlot = await page.locator('.level2-slot');

    const btnRootIncrement1 = await page.locator('.root-increment1');
    const btnRootIncrement2 = await page.locator('.root-increment2');
    const btnLevel2Increment = await page.locator('.level2-increment3').nth(0);
    const btnLevel2Increment2 = await page.locator('.level2-increment3').nth(1);

    expect(await level2State1.allTextContents()).toEqual([
      'ROOT / state1 = 0',
      'ROOT / state1 = 0',
    ]);
    expect(await level2State2.allTextContents()).toEqual([
      'ROOT / state2 = 0',
      'ROOT / state2 = 0',
    ]);
    expect(await level2SSlot.allTextContents()).toEqual(['bar = 0', 'bar = 0']);

    await btnRootIncrement1.click();
    await page.waitForTimeout(100);

    expect(await level2State1.allTextContents()).toEqual([
      'ROOT / state1 = 1',
      'ROOT / state1 = 1',
    ]);
    expect(await level2State2.allTextContents()).toEqual([
      'ROOT / state2 = 0',
      'ROOT / state2 = 0',
    ]);
    expect(await level2SSlot.allTextContents()).toEqual(['bar = 0', 'bar = 0']);
    await btnRootIncrement2.click();
    await page.waitForTimeout(100);

    expect(await level2State1.allTextContents()).toEqual([
      'ROOT / state1 = 1',
      'ROOT / state1 = 1',
    ]);
    expect(await level2State2.allTextContents()).toEqual([
      'ROOT / state2 = 1',
      'ROOT / state2 = 1',
    ]);
    expect(await level2SSlot.allTextContents()).toEqual(['bar = 0', 'bar = 0']);
    await btnLevel2Increment.click();
    await btnLevel2Increment.click();
    await btnLevel2Increment2.click();
    await page.waitForTimeout(100);

    const level3State1 = await page.locator('.level3-state1');
    const level3State2 = await page.locator('.level3-state2');
    const level3State3 = await page.locator('.level3-state3');
    const level3Slot = await page.locator('.level3-slot');

    expect(await level2State1.allTextContents()).toEqual([
      'ROOT / state1 = 1',
      'ROOT / state1 = 1',
    ]);
    expect(await level2State2.allTextContents()).toEqual([
      'ROOT / state2 = 1',
      'ROOT / state2 = 1',
    ]);
    expect(await level2SSlot.allTextContents()).toEqual(['bar = 0', 'bar = 0']);

    expect(await level3State1.allTextContents()).toEqual([
      'Level2 / state1 = 0',
      'Level2 / state1 = 0',
      'Level2 / state1 = 0',
    ]);
    expect(await level3State2.allTextContents()).toEqual([
      'ROOT / state2 = 1',
      'ROOT / state2 = 1',
      'ROOT / state2 = 1',
    ]);
    expect(await level3State3.allTextContents()).toEqual([
      'Level2 / state3 = 2',
      'Level2 / state3 = 2',
      'Level2 / state3 = 1',
    ]);
    expect(await level3Slot.allTextContents()).toEqual(['bar = 0', 'bar = 0', 'bar = 0']);
  });
});
