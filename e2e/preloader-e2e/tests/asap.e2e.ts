import { expect, test, type Page } from '@playwright/test';
import { getManifest, ORIGIN } from '../utils/app';
import { fixtureById, NAVIGATION_SOURCES, type Fixture } from '../utils/fixtures';
import {
  countRoundTrips,
  createGate,
  preloaderLinks,
  recordSpeculativePreloads,
  release,
  releaseAll,
  resultIsDone,
  settle,
  waitForQwikloader,
} from '../utils/gate';
import { expectResult, fixtureResult, fixtureRoot } from '../utils/scenarios';

const CONDITIONAL_ALL = fixtureById('conditional/all');
const FROM_OFF: Fixture = {
  id: 'navigation/from-off',
  path: '/navigation/from/off/',
  sources: NAVIGATION_SOURCES,
};
const TO_TREE: Fixture = {
  id: 'navigation/to-tree',
  path: '/navigation/to-tree/',
  sources: NAVIGATION_SOURCES,
  expected: '16',
};

const coreUrl = () => `${ORIGIN}/build/${getManifest().core}`;
const preloaderUrl = () => `${ORIGIN}/build/${getManifest().preloader}`;
const bundleGraphUrl = () => `${ORIGIN}/${getManifest().bundleGraphAsset}`;

const clickWhileLoading = async (
  page: Page,
  heldUrl: string,
  trigger: () => Promise<unknown>,
  result: Fixture
) => {
  await recordSpeculativePreloads(page);
  const gate = await createGate(page);
  gate.holdWhilePassing = (url) => url === heldUrl;
  await page.goto(result === TO_TREE ? FROM_OFF.path : result.path, { waitUntil: 'commit' });
  await waitForQwikloader(page);
  await expect.poll(() => gate.held.length).toBe(1);
  const startupPiece = gate.held.splice(0);
  gate.holdWhilePassing = undefined;
  const roundTrips = await countRoundTrips(
    page,
    gate,
    trigger,
    resultIsDone(fixtureResult(page, result)),
    startupPiece,
    { setSpeculativeAside: true }
  );
  return { gate, startupPiece, roundTrips };
};

const clickConditional = (page: Page) => () =>
  fixtureRoot(page, CONDITIONAL_ALL).locator('[data-testid=trigger]').click();

test.describe('click before core loaded', () => {
  test("the click isn't lost: the result shows once core arrives", async ({ page }) => {
    const { gate, startupPiece } = await clickWhileLoading(
      page,
      coreUrl(),
      clickConditional(page),
      CONDITIONAL_ALL
    );
    await releaseAll(gate, startupPiece);
    await expectResult(page, CONDITIONAL_ALL);
  });
});

const firstPreloads = async (page: Page, gate: Awaited<ReturnType<typeof createGate>>) => {
  await settle(page, gate);
  return preloaderLinks(page);
};

for (const [name, heldUrl] of [
  ['the preloader', preloaderUrl],
  ['the bundle graph', bundleGraphUrl],
] as const) {
  test.describe(`click before ${name} loaded`, () => {
    test("the click isn't lost: the result shows", async ({ page }) => {
      const { gate, startupPiece } = await clickWhileLoading(
        page,
        heldUrl(),
        clickConditional(page),
        CONDITIONAL_ALL
      );
      await releaseAll(gate, startupPiece);
      await expectResult(page, CONDITIONAL_ALL);
    });

    test(`once ${name} arrives, the needed preloads go out before any speculative preload`, async ({
      page,
    }) => {
      test.fail(
        true,
        'on main, hints sent before the preloader runs come out as speculative: a later 0.6 hint overwrites their probability'
      );
      const { gate, startupPiece, roundTrips } = await clickWhileLoading(
        page,
        heldUrl(),
        clickConditional(page),
        CONDITIONAL_ALL
      );
      const clickChunks = new Set(roundTrips.flatMap((roundTrip) => roundTrip.urls));
      gate.mode = 'pass';
      await release([...gate.held.splice(0), ...startupPiece.splice(0)]);
      await page.waitForFunction(() => typeof (globalThis as any).qPreload === 'function');
      const links = await firstPreloads(page, gate);
      const firstSpeculative = links.findIndex((link) => link.speculative);
      const neededBeforeIt = links
        .slice(0, firstSpeculative < 0 ? links.length : firstSpeculative)
        .filter((link) => clickChunks.has(link.href));
      expect(neededBeforeIt.length).toBeGreaterThan(0);
    });
  });
}

test.describe('navigation click before the preloader loaded', () => {
  test('the new page shows', async ({ page }) => {
    const { gate, startupPiece } = await clickWhileLoading(
      page,
      preloaderUrl(),
      () => fixtureRoot(page, FROM_OFF).locator('[data-testid=link-tree]').click(),
      TO_TREE
    );
    await releaseAll(gate, startupPiece);
    await expectResult(page, TO_TREE);
  });
});
