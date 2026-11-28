import { expect, test, type Browser, type Page } from '@playwright/test';
import { chunkComesFrom, getCoreBundle, getManifest, ORIGIN } from '../utils/app';
import { fixtureById, PRIORITY } from '../utils/fixtures';
import { createGate, openCold, releaseAll, waitForQwikloader } from '../utils/gate';
import { clickTrigger, expectResult, fixtureRoot } from '../utils/scenarios';

const SINGLE_TASK_CHAIN = fixtureById('single/task-chain');
const HERO_IMAGE = `${ORIGIN}/priority-hero.png`;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

const coreUrl = () => `${ORIGIN}/build/${getCoreBundle()}`;
const preloaderUrl = () => `${ORIGIN}/build/${getManifest().preloader}`;
const bundleGraphUrl = () => `${ORIGIN}/${getManifest().bundleGraphAsset}`;

const ignoresLowPriorityOnAddedModulepreloads = (browser: Browser) =>
  Number(browser.version().split('.')[0]) < 158;
const IGNORES_LOW_PRIORITY_ON_ADDED_MODULEPRELOADS =
  'Chromium 148 ignores fetchpriority on a modulepreload added from a script; 158 honors it';

type AddedLink = { href: string; fetchPriority: string | null; beforeLoad: boolean };

const recordAddedPreloads = (page: Page) =>
  page.addInitScript(() => {
    const added: AddedLink[] = ((window as any).__addedPreloads = []);
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLLinkElement && /preload/i.test(node.rel)) {
            added.push({
              href: node.href,
              fetchPriority: node.getAttribute('fetchpriority'),
              beforeLoad: document.readyState !== 'complete',
            });
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });

const addedPreloads = (page: Page) =>
  page.evaluate(() => (window as any).__addedPreloads as AddedLink[]);

const recordPriorities = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Page.enable');
  const requests = new Map<string, { url: string; priority: string; beforeLoad: boolean }>();
  let hasLoaded = false;
  cdp.on('Page.loadEventFired', () => (hasLoaded = true));
  cdp.on('Network.requestWillBeSent', (event) =>
    requests.set(event.requestId, {
      url: event.request.url,
      priority: event.request.initialPriority,
      beforeLoad: !hasLoaded,
    })
  );
  cdp.on('Network.resourceChangedPriority', (event) => {
    const request = requests.get(event.requestId);
    if (request) {
      request.priority = event.newPriority;
    }
  });
  return () => [...requests.values()];
};

const serveTheHeroImageSlowly = (page: Page) =>
  page.route(HERO_IMAGE, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ contentType: 'image/png', body: PNG });
  });

test.describe('before any user event', () => {
  test('every modulepreload added while the page loads is low: on /priority/ none lacks fetchpriority="low"', async ({
    page,
  }) => {
    await recordAddedPreloads(page);
    await serveTheHeroImageSlowly(page);
    await page.goto(PRIORITY.path);
    await expectResult(page, PRIORITY);
    const whileLoading = (await addedPreloads(page)).filter((link) => link.beforeLoad);
    const hrefs = whileLoading.map((link) => link.href);
    expect(hrefs).toContain(coreUrl());
    expect(hrefs.some((href) => chunkComesFrom(href, PRIORITY.sources))).toBe(true);
    expect(whileLoading.filter((link) => link.fetchPriority !== 'low')).toEqual([]);
  });

  test('fetches the bundle graph once: its low preload is reused when the preloader starts', async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto(PRIORITY.path);
    await page.waitForFunction(() => typeof (globalThis as any).qPreload === 'function');
    await expectResult(page, PRIORITY);
    expect(requests.filter((url) => url === bundleGraphUrl())).toHaveLength(1);
  });

  test("core, the preloader's files and a visible task's chunk go out at Low: on /priority/ each of them is Low and the hero image is High", async ({
    page,
    browser,
  }) => {
    test.skip(
      ignoresLowPriorityOnAddedModulepreloads(browser),
      IGNORES_LOW_PRIORITY_ON_ADDED_MODULEPRELOADS
    );
    const priorities = await recordPriorities(page);
    await serveTheHeroImageSlowly(page);
    await page.goto(PRIORITY.path);
    await expectResult(page, PRIORITY);
    const whileLoading = priorities().filter((request) => request.beforeLoad);
    const priorityOf = (url: string) =>
      whileLoading.find((request) => request.url === url)?.priority;
    const taskChunk = whileLoading.find((request) => chunkComesFrom(request.url, PRIORITY.sources));
    expect(priorityOf(HERO_IMAGE)).toBe('High');
    expect(priorityOf(coreUrl())).toBe('Low');
    expect(priorityOf(preloaderUrl())).toBe('Low');
    expect(priorityOf(bundleGraphUrl())).toBe('Low');
    expect(taskChunk?.priority).toBe('Low');
  });
});

test.describe('click', () => {
  test("a click after load fetches its chunks at high priority: the button's handler chunk is High", async ({
    page,
  }) => {
    const priorities = await recordPriorities(page);
    const gate = await createGate(page);
    await openCold(page, gate, SINGLE_TASK_CHAIN.path);
    const requestedBeforeTheClick = new Set(priorities().map((request) => request.url));
    await clickTrigger({ page, fixture: SINGLE_TASK_CHAIN, gate });
    await releaseAll(gate);
    await expectResult(page, SINGLE_TASK_CHAIN);
    const requestedByTheClick = priorities().filter(
      (request) =>
        !requestedBeforeTheClick.has(request.url) &&
        chunkComesFrom(request.url, SINGLE_TASK_CHAIN.sources)
    );
    expect(requestedByTheClick.length).toBeGreaterThan(0);
    expect(requestedByTheClick.filter((request) => request.priority !== 'High')).toEqual([]);
  });

  test('a click before core has landed fetches core once: its import joins the low request', async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    const gate = await createGate(page);
    gate.holdWhilePassing = (url) => url === coreUrl();
    await page.goto(PRIORITY.path, { waitUntil: 'commit' });
    await waitForQwikloader(page);
    await fixtureRoot(page, PRIORITY).locator('[data-testid=trigger]').click();
    gate.holdWhilePassing = undefined;
    await releaseAll(gate);
    await expect(fixtureRoot(page, PRIORITY).locator('[data-testid=clicks]')).toHaveText('1');
    expect(requests.filter((url) => url === coreUrl())).toHaveLength(1);
  });
});
