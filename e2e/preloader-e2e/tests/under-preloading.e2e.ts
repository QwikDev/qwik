import { expect, test } from '@playwright/test';
import { CONDITIONAL_MODAL, fixtureById } from '../utils/fixtures';
import { warmClick } from '../utils/scenarios';

test.describe('under-preloading', () => {
  test.describe('warm click, once the preloader has nothing left to preload', () => {
    test('opens a modal without a request: the component QRLs inside its panel were preloaded', async ({
      page,
    }) => {
      expect(await warmClick(page, CONDITIONAL_MODAL)).toEqual([]);
    });

    test("shows a conditional tree without a request: every level's component QRL was preloaded", async ({
      page,
    }) => {
      expect(await warmClick(page, fixtureById('conditional/render'))).toEqual([]);
    });
  });
});
