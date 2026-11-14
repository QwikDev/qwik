import { expect, test } from '@playwright/test';
import { CONDITIONAL_MODAL, fixtureById } from '../utils/fixtures';
import { releaseAll, resultIsDone } from '../utils/gate';
import {
  clickTrigger,
  countFixtureRoundTrips,
  fixtureRoot,
  openFixture,
  warmClick,
} from '../utils/scenarios';

test.describe('under-preloading', () => {
  test.describe('warm click, once the preloader has nothing left to preload', () => {
    test('opens a modal without a request: the component QRLs inside its panel were preloaded', async ({
      page,
    }) => {
      expect(await warmClick(page, CONDITIONAL_MODAL)).toEqual([]);
    });

    test('clicks a button inside the opened modal without a request: its handler QRL was preloaded before the modal opened', async ({
      page,
    }) => {
      const opened = await openFixture(page, CONDITIONAL_MODAL, 'warm');
      await clickTrigger(opened);
      const modal = fixtureRoot(page, CONDITIONAL_MODAL);
      const roundTrips = await countFixtureRoundTrips(
        opened,
        () => modal.locator('[data-testid=confirm]').click(),
        resultIsDone(modal.locator('[data-testid=confirmed]'))
      );
      await releaseAll(opened.gate);
      expect(roundTrips).toEqual([]);
    });

    test("shows a conditional tree without a request: every level's component QRL was preloaded", async ({
      page,
    }) => {
      expect(await warmClick(page, fixtureById('conditional/render'))).toEqual([]);
    });
  });
});
