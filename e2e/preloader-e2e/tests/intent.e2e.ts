import { expect, test, type Page } from '@playwright/test';
import { chunkComesFrom, chunkHasClickHandler } from '../utils/app';
import { fixtureById, ROUND_TRIPS_ON_MAIN } from '../utils/fixtures';
import { collectUntilQuiet, releaseAll } from '../utils/gate';
import { clickTrigger, expectResult, fixtureRoot, openFixture } from '../utils/scenarios';

const TREE_OF_TASKS = fixtureById('tree/task-chain');

const trigger = (page: Page) => fixtureRoot(page, TREE_OF_TASKS).locator('[data-testid=trigger]');

const isItsClickHandlerChunk = (url: string) =>
  chunkComesFrom(url, TREE_OF_TASKS.sources) && chunkHasClickHandler(url);

test.describe('intent', () => {
  test("hover on a button: its click handler's chunk is requested before any click", async ({
    page,
  }) => {
    const opened = await openFixture(page, TREE_OF_TASKS, 'cold');
    const requested = await collectUntilQuiet(page, opened.gate, () => trigger(page).hover());
    await releaseAll(opened.gate);
    expect(requested.filter(isItsClickHandlerChunk)).toHaveLength(1);
  });

  test("keyboard focus on a button: its click handler's chunk is requested before any click", async ({
    page,
  }) => {
    const opened = await openFixture(page, TREE_OF_TASKS, 'cold');
    const requested = await collectUntilQuiet(page, opened.gate, () => trigger(page).focus());
    await releaseAll(opened.gate);
    expect(requested.filter(isItsClickHandlerChunk)).toHaveLength(1);
  });

  test('a cold click after a hover shows the result in one round trip fewer', async ({ page }) => {
    const opened = await openFixture(page, TREE_OF_TASKS, 'cold');
    await collectUntilQuiet(page, opened.gate, () => trigger(page).hover());
    const roundTrips = await clickTrigger(opened);
    await releaseAll(opened.gate);
    await expectResult(page, TREE_OF_TASKS);
    expect(roundTrips).toHaveLength(ROUND_TRIPS_ON_MAIN[TREE_OF_TASKS.id].roundTrips - 1);
  });
});
