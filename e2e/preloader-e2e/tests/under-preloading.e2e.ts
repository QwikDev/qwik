import { expect, test } from '@playwright/test';
import { fixtureById } from '../utils/fixtures';
import { warmClick } from '../utils/scenarios';

test.describe('under-preloading', () => {
  test.describe('warm click, once the preloader has nothing left to preload', () => {
    test("shows a conditional tree without a request: every level's component QRL was preloaded", async ({
      page,
    }) => {
      expect(await warmClick(page, fixtureById('conditional/render'))).toEqual([]);
    });
  });
});
