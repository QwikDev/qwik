import type { Locator, Page, Route } from '@playwright/test';
import {
  chunkComesFrom,
  chunkHasVisibleTask,
  chunkHoldsSegmentsFrom,
  labelRequest,
  ORIGIN,
} from './app';
import type { Fixture } from './fixtures';

const FILLER = 'src/components/filler/';

const QUIET_MS = 250;
const ARMING_QUIET_MS = 50;
const ARMING_IDLE_STEP_MS = 250;
const ARMING_IDLE_LIMIT_MS = 2000;
const MAX_ROUND_TRIPS = 20;

export type Gate = {
  mode: 'pass' | 'hold';
  held: Route[];
  holdWhilePassing?: (url: string) => boolean;
};

export type RoundTrip = {
  urls: string[];
  ongoingUrls: string[];
};

export type PreloaderLink = { href: string; speculative: boolean };

type PreloaderWindow = Window & {
  __preloaderLinks?: PreloaderLink[];
  __speculativeInFlight?: number;
  __maxSpeculativeInFlight?: number;
};

export const recordSpeculativePreloads = (page: Page) =>
  page.addInitScript(() => {
    const win = window as PreloaderWindow;
    win.__preloaderLinks = [];
    win.__speculativeInFlight = 0;
    win.__maxSpeculativeInFlight = 0;
    const appendChild = Node.prototype.appendChild;
    Node.prototype.appendChild = function <T extends Node>(this: Node, node: T): T {
      if (node instanceof HTMLLinkElement && /preload/i.test(node.rel)) {
        const speculative = node.getAttribute('fetchpriority') === 'low';
        win.__preloaderLinks!.push({ href: node.href, speculative });
        if (speculative) {
          win.__speculativeInFlight!++;
          win.__maxSpeculativeInFlight = Math.max(
            win.__maxSpeculativeInFlight!,
            win.__speculativeInFlight!
          );
          const settled = () => win.__speculativeInFlight!--;
          node.addEventListener('load', settled, { once: true });
          node.addEventListener('error', settled, { once: true });
        }
      }
      return appendChild.call(this, node) as T;
    };
  });

export const maxSpeculativeInFlight = (page: Page) =>
  page.evaluate(() => (window as PreloaderWindow).__maxSpeculativeInFlight ?? 0);

export const preloaderLinks = (page: Page) =>
  page.evaluate(() => (window as PreloaderWindow).__preloaderLinks ?? []);

export const speculativePreloads = async (page: Page) =>
  new Set((await preloaderLinks(page)).filter((link) => link.speculative).map((link) => link.href));

export const createGate = async (page: Page): Promise<Gate> => {
  const gate: Gate = { mode: 'pass', held: [] };
  await page.route(`${ORIGIN}/**`, (route) => {
    const request = route.request();
    const holds =
      gate.mode === 'hold'
        ? !request.isNavigationRequest()
        : gate.holdWhilePassing?.(request.url());
    if (!holds) {
      return route.continue();
    }
    gate.held.push(route);
  });
  return gate;
};

export const settle = async (page: Page, gate: Gate, quietMs = QUIET_MS) => {
  let lastCount = -1;
  let stableRounds = 0;
  while (stableRounds < 2) {
    await page.evaluate(
      () => new Promise((resolve) => requestIdleCallback(() => resolve(null), { timeout: 2000 }))
    );
    await page.waitForTimeout(quietMs);
    if (gate.held.length === lastCount) {
      stableRounds++;
    } else {
      stableRounds = 0;
      lastCount = gate.held.length;
    }
  }
};

export const release = async (routes: Route[]) => {
  await Promise.all(routes.map((route) => route.continue().catch(() => {})));
};

export const releaseAll = async (gate: Gate, ongoing: Route[] = []) => {
  gate.mode = 'pass';
  await release([...gate.held.splice(0), ...ongoing.splice(0)]);
};

export const waitForQwikloader = (page: Page) =>
  page.waitForFunction(() => (window as any)._qwikEv?.roots, null, { timeout: 15_000 });

const hasVisibleTaskInView = (page: Page, fixtureId: string) => {
  const root = `[data-fixture="${fixtureId}"]`;
  return page.locator(`${root}[q-e\\:qvisible], ${root} [q-e\\:qvisible]`).evaluateAll((elements) =>
    elements.some((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    })
  );
};

const takeRoutes = (routes: Route[], shouldTake: (route: Route) => boolean) => {
  const taken = routes.filter(shouldTake);
  routes.splice(0, routes.length, ...routes.filter((route) => !shouldTake(route)));
  return taken;
};

const urlsOf = (routes: Route[]) => routes.map((route) => route.request().url());

export const openCold = async (page: Page, gate: Gate, fixture: Fixture) => {
  page.once('load', () => {
    gate.mode = 'hold';
  });
  await page.goto(fixture.path);
  await waitForQwikloader(page);
  const runsVisibleTasksAtLoad = await hasVisibleTaskInView(page, fixture.id);
  const isOngoingCandidate = (url: string) =>
    chunkComesFrom(url, [FILLER]) ||
    (chunkComesFrom(url, fixture.sources) && !(runsVisibleTasksAtLoad && chunkHasVisibleTask(url)));
  let idleMs = 0;
  for (;;) {
    await settle(page, gate, ARMING_QUIET_MS);
    const speculative = await speculativePreloads(page);
    const isSpeculative = (route: Route) => speculative.has(route.request().url());
    const loadWork = gate.held.filter((route) => !isSpeculative(route));
    if (loadWork.length) {
      gate.held = gate.held.filter(isSpeculative);
      await release(loadWork);
      idleMs = 0;
      continue;
    }
    if (gate.held.some((route) => isOngoingCandidate(route.request().url()))) {
      return gate.held.splice(0);
    }
    if (gate.held.length) {
      await release(gate.held.splice(0));
      idleMs = 0;
      continue;
    }
    idleMs += ARMING_IDLE_STEP_MS;
    if (idleMs > ARMING_IDLE_LIMIT_MS) {
      throw new Error('The preloader went idle before preloading any filler chunk');
    }
    await page.waitForTimeout(ARMING_IDLE_STEP_MS);
  }
};

export const openWarm = async (page: Page, gate: Gate, path: string) => {
  await page.goto(path);
  await waitForQwikloader(page);
  await page.waitForFunction(() => typeof (globalThis as any).qPreload === 'function', null, {
    timeout: 15_000,
  });
  let requests = 0;
  const countRequest = () => requests++;
  page.on('request', countRequest);
  let lastCount = -1;
  while (requests !== lastCount) {
    lastCount = requests;
    await page.waitForTimeout(1000);
  }
  page.off('request', countRequest);
  gate.mode = 'hold';
};

export const countRoundTrips = async (
  page: Page,
  gate: Gate,
  action: () => Promise<unknown>,
  isDone: () => Promise<boolean>,
  ongoing: Route[] = [],
  { ownSources = [] as string[], setSpeculativeAside = false } = {}
) => {
  gate.mode = 'hold';
  await action();
  const roundTrips: RoundTrip[] = [];
  const ownOngoing = takeRoutes(ongoing, (route) =>
    chunkComesFrom(route.request().url(), ownSources)
  );
  for (;;) {
    await settle(page, gate);
    if (await isDone()) {
      ongoing.push(...ownOngoing);
      return roundTrips;
    }
    if (setSpeculativeAside) {
      const speculative = await speculativePreloads(page);
      const isSpeculative = (route: Route) => speculative.has(route.request().url());
      ongoing.push(...gate.held.filter(isSpeculative));
      gate.held = gate.held.filter((route) => !isSpeculative(route));
    }
    let ongoingRoutes = ownOngoing.splice(0);
    let routes = [...gate.held.splice(0), ...ongoingRoutes];
    if (!routes.length) {
      routes = ongoingRoutes = ongoing.splice(0);
    }
    if (!routes.length) {
      throw new Error(`Not done and nothing requested after ${roundTrips.length} round trips`);
    }
    roundTrips.push({ urls: urlsOf(routes), ongoingUrls: urlsOf(ongoingRoutes) });
    await release(routes);
    if (roundTrips.length > MAX_ROUND_TRIPS) {
      throw new Error(`More than ${MAX_ROUND_TRIPS} round trips`);
    }
  }
};

export const resultIsDone = (result: Locator) => () =>
  result.evaluateAll((elements) =>
    elements.some((element) => element.hasAttribute('data-done') && element.checkVisibility())
  );

export const formatRoundTrips = (
  roundTrips: RoundTrip[],
  {
    segmentsFrom,
    keepEmptyRoundTrips = false,
  }: { segmentsFrom?: string[]; keepEmptyRoundTrips?: boolean } = {}
) =>
  roundTrips
    .map(({ urls }) =>
      segmentsFrom ? urls.filter((url) => chunkHoldsSegmentsFrom(url, segmentsFrom)) : urls
    )
    .filter((urls) => keepEmptyRoundTrips || urls.length)
    .map((urls, index) => {
      const labels = [...new Set(urls.map(labelRequest))].sort();
      return [`round trip ${index + 1}:`, ...labels.map((label) => `  ${label}`)].join('\n');
    })
    .join('\n') + '\n';

export const collectUntilQuiet = async (page: Page, gate: Gate, action: () => Promise<unknown>) => {
  gate.mode = 'hold';
  await action();
  const urls: string[] = [];
  for (;;) {
    await settle(page, gate);
    const routes = gate.held.splice(0);
    if (!routes.length) {
      return urls;
    }
    urls.push(...routes.map((route) => route.request().url()));
    await release(routes);
  }
};

const ownerOf = (url: string) =>
  labelRequest(url)
    .split(' + ')[0]
    .replace(/\.tsx_.*$/, '.tsx');

export const recordSpeculativeOrder = async (page: Page, gate: Gate, quietMs = 1500) => {
  gate.mode = 'hold';
  const order: string[] = [];
  let quietSince = Date.now();
  while (Date.now() - quietSince < quietMs) {
    await page.waitForTimeout(20);
    const routes = gate.held.splice(0);
    if (!routes.length) {
      continue;
    }
    quietSince = Date.now();
    const speculative = await speculativePreloads(page);
    for (const route of routes) {
      const url = route.request().url();
      if (speculative.has(url) && order[order.length - 1] !== ownerOf(url)) {
        order.push(ownerOf(url));
      }
    }
    await release(routes);
  }
  return order.join('\n') + '\n';
};
