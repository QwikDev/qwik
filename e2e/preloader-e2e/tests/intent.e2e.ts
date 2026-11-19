import { expect, test, type Page } from '@playwright/test';
import { chunkComesFrom, chunkHasClickHandler, chunkKind } from '../utils/app';
import { CLICKABLE_ON_ALL_AT_ONCE, fixtureById, type Fixture } from '../utils/fixtures';
import {
  createGate,
  FILLER,
  preloaderLinks,
  recordSpeculativePreloads,
  release,
  waitForQwikloader,
  type Gate,
} from '../utils/gate';
import { fixtureRoot } from '../utils/scenarios';

const TREE_OF_TASKS = fixtureById('tree/task-chain');
const THREE_BUTTONS = ['single/task-chain', 'single/computed-chain', 'single/store-chain'].map(
  (id) => CLICKABLE_ON_ALL_AT_ONCE.find((fixture) => fixture.id === id)!
);

const trigger = (page: Page, fixture: Fixture) =>
  fixtureRoot(page, fixture).locator('[data-testid=trigger]');

const isClickHandlerChunkOf = (fixture: Fixture) => (url: string) =>
  chunkComesFrom(url, fixture.sources) && chunkHasClickHandler(url);

const openWithSpeculativePreloadsHeld = async (page: Page, path: string) => {
  await recordSpeculativePreloads(page);
  const gate = await createGate(page);
  gate.holdWhilePassing = (url) => chunkComesFrom(url, [FILLER]);
  await page.goto(path, { waitUntil: 'commit' });
  await waitForQwikloader(page);
  await expect.poll(() => gate.held.length, { timeout: 15_000 }).toBe(1);
  return gate;
};

const letThePreloaderApplyItsHints = (page: Page) =>
  page.evaluate(
    () => new Promise((resolve) => requestIdleCallback(() => resolve(null), { timeout: 2000 }))
  );

const letSpeculativePreloadsGo = async (gate: Gate) => {
  gate.holdWhilePassing = undefined;
  await release(gate.held.splice(0));
};

const speculativeQrlChunksSince = async (page: Page, count: number) =>
  (await preloaderLinks(page))
    .slice(count)
    .filter((link) => link.speculative && chunkKind(link.href))
    .map((link) => link.href);

test.describe('intent', () => {
  for (const [intent, show] of [
    ['hover on a button', (page: Page) => trigger(page, TREE_OF_TASKS).hover()],
    ['keyboard focus on a button', (page: Page) => trigger(page, TREE_OF_TASKS).focus()],
  ] as const) {
    test(`${intent}: its click handler's chunk is the next speculative preload`, async ({
      page,
    }) => {
      const gate = await openWithSpeculativePreloadsHeld(page, TREE_OF_TASKS.path);
      const linksBefore = (await preloaderLinks(page)).length;

      await show(page);
      await letThePreloaderApplyItsHints(page);
      await letSpeculativePreloadsGo(gate);

      await expect
        .poll(async () => (await speculativeQrlChunksSince(page, linksBefore)).length)
        .toBeGreaterThan(0);
      const [next] = await speculativeQrlChunksSince(page, linksBefore);
      expect(isClickHandlerChunkOf(TREE_OF_TASKS)(next)).toBe(true);
    });
  }

  test("after focusing three buttons in turn, the last one's click handler is preloaded first", async ({
    page,
  }) => {
    const gate = await openWithSpeculativePreloadsHeld(page, THREE_BUTTONS[0].path);
    const linksBefore = (await preloaderLinks(page)).length;

    for (const fixture of THREE_BUTTONS) {
      await trigger(page, fixture).focus();
    }
    await letThePreloaderApplyItsHints(page);
    await letSpeculativePreloadsGo(gate);

    const clickHandlersPreloaded = async () =>
      (await speculativeQrlChunksSince(page, linksBefore)).flatMap((url) =>
        THREE_BUTTONS.filter((fixture) => isClickHandlerChunkOf(fixture)(url)).map(
          (fixture) => fixture.id
        )
      );
    await expect.poll(clickHandlersPreloaded).toHaveLength(THREE_BUTTONS.length);
    expect(await clickHandlersPreloaded()).toEqual(
      THREE_BUTTONS.map((fixture) => fixture.id).reverse()
    );
  });
});
