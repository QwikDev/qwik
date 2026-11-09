import { expect, test, type Page } from '@playwright/test';
import { chunkComesFrom } from '../utils/app';
import { attachRoundTrips, expectRoundTrips } from '../utils/click-tests';
import { NAVIGATION_SOURCES, type Fixture } from '../utils/fixtures';
import {
  collectUntilQuiet,
  countRoundTrips,
  recordSpeculativeOrder,
  releaseAll,
  resultIsDone,
} from '../utils/gate';
import {
  countFixtureRoundTrips,
  expectResult,
  fixtureResult,
  fixtureRoot,
  openFixture,
} from '../utils/scenarios';

const FROM: Record<'off' | 'visible' | 'intent', Fixture> = {
  off: { id: 'navigation/from-off', path: '/navigation/from/off/', sources: NAVIGATION_SOURCES },
  visible: {
    id: 'navigation/from-visible',
    path: '/navigation/from/visible/',
    sources: NAVIGATION_SOURCES,
  },
  intent: {
    id: 'navigation/from-intent',
    path: '/navigation/from/intent/',
    sources: NAVIGATION_SOURCES,
  },
};
const TO_TREE: Fixture = {
  id: 'navigation/to-tree',
  path: '/navigation/to-tree/',
  sources: NAVIGATION_SOURCES,
  expected: '16',
};
const ACTION: Fixture = {
  id: 'navigation/action',
  path: '/navigation/action/',
  sources: NAVIGATION_SOURCES,
  expected: '42',
};
const TO_TREE_SOURCES = [
  'src/routes/navigation/to-tree/',
  'src/components/fixtures/navigation/nav-tree',
];

const treeLink = (page: Page, from: Fixture) =>
  fixtureRoot(page, from).locator('[data-testid=link-tree]');

const navigateToTree = async (from: Fixture, state: 'cold' | 'warm', page: Page) => {
  const opened = await openFixture(page, from, state);
  const roundTrips = await countFixtureRoundTrips(
    opened,
    () => treeLink(page, from).click(),
    resultIsDone(fixtureResult(page, TO_TREE))
  );
  return { ...opened, roundTrips };
};

test.describe('cold SPA navigation', () => {
  test('every render chunk of the new page goes out in the same round trip', async ({ page }) => {
    test.fail(true, 'on main, the route module loads a round trip before its render chunks');
    const { gate, ongoing, roundTrips } = await navigateToTree(FROM.off, 'cold', page);
    await releaseAll(gate, ongoing);
    await expectResult(page, TO_TREE);
    const withNewPageChunks = roundTrips.filter((roundTrip) =>
      roundTrip.urls.some((url) => chunkComesFrom(url, TO_TREE_SOURCES))
    );
    expect(withNewPageChunks).toHaveLength(1);
  });

  test('the new page shows in 2 round trips', async ({ page }) => {
    const { gate, ongoing, roundTrips } = await navigateToTree(FROM.off, 'cold', page);
    await releaseAll(gate, ongoing);
    await attachRoundTrips('round-trips.txt', roundTrips);
    expectRoundTrips(roundTrips, {
      roundTrips: 4,
      reason:
        "over the cap on main: the Link handler, the router's navigation code, then the layout and route modules each cost a round trip before the render chunks",
    });
  });
});

test.describe('warm SPA navigation', () => {
  test('the new page shows with no JS request', async ({ page }) => {
    test.fail(
      true,
      "on main, the router's navigation code (@qwik-router-config, useQwikRouter) is never preloaded"
    );
    const { gate, roundTrips } = await navigateToTree(FROM.visible, 'warm', page);
    await releaseAll(gate);
    await expectResult(page, TO_TREE);
    const jsRequests = roundTrips.flatMap((roundTrip) =>
      roundTrip.urls.filter((url) => new URL(url).pathname.endsWith('.js'))
    );
    expect(jsRequests).toEqual([]);
  });
});

test.describe('hover, then click', () => {
  test("the new route's chunks are requested on hover", async ({ page }) => {
    const { gate, ongoing } = await openFixture(page, FROM.intent, 'cold');
    const urls = await collectUntilQuiet(page, gate, () => treeLink(page, FROM.intent).hover());
    await releaseAll(gate, ongoing);
    expect(urls.some((url) => chunkComesFrom(url, TO_TREE_SOURCES))).toBe(true);
  });
});

test.describe('after a navigation', () => {
  test('the preloader keeps preloading speculatively', async ({ page }, testInfo) => {
    const { gate, ongoing } = await navigateToTree(FROM.off, 'cold', page);
    await releaseAll(gate, ongoing);
    const order = await recordSpeculativeOrder(page, gate);
    await testInfo.attach('order.txt', { body: order, contentType: 'text/plain' });
    expect(order.trim()).not.toBe('');
  });
});

test.describe('back button', () => {
  test('the previous page shows with no JS request', async ({ page }) => {
    test.fail(
      true,
      'on main, going back renders the previous page on the client and finds its chunks one round trip at a time'
    );
    const { gate } = await navigateToTree(FROM.visible, 'warm', page);
    await releaseAll(gate);
    await expectResult(page, TO_TREE);
    gate.mode = 'hold';
    const roundTrips = await countRoundTrips(
      page,
      gate,
      () => page.goBack(),
      () => treeLink(page, FROM.visible).isVisible()
    );
    await releaseAll(gate);
    const jsRequests = roundTrips.flatMap((roundTrip) =>
      roundTrip.urls.filter((url) => new URL(url).pathname.endsWith('.js'))
    );
    expect(jsRequests).toEqual([]);
  });
});

const submitAction = async (page: Page) => {
  const opened = await openFixture(page, ACTION, 'cold');
  const roundTrips = await countFixtureRoundTrips(
    opened,
    () => fixtureRoot(page, ACTION).locator('[data-testid=trigger]').click(),
    resultIsDone(fixtureResult(page, ACTION))
  );
  await releaseAll(opened.gate, opened.ongoing);
  await expectResult(page, ACTION);
  return roundTrips;
};

test.describe('form action', () => {
  test("the action's result shows in 2 round trips", async ({ page }) => {
    const roundTrips = await submitAction(page);
    await attachRoundTrips('round-trips.txt', roundTrips);
    expectRoundTrips(roundTrips, {
      roundTrips: 4,
      reason: 'over the cap on main: the action request waits for 3 round trips of router code',
    });
  });
});
