import type { Locator, Page, Request, Route } from '@playwright/test';
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
const DOWNLOAD_LIMIT_MS = 30_000;
const NETWORK_IDLE_LIMIT_MS = 60_000;

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

const failAfter = (ms: number, message: string) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const failure = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return { failure, cancel: () => clearTimeout(timer) };
};

const releaseUntilDownloaded = async (route: Route) => {
  await route.continue().catch(() => {});
  const url = route.request().url();
  const deadline = failAfter(DOWNLOAD_LIMIT_MS, `${url} did not finish downloading`);
  try {
    await Promise.race([
      route
        .request()
        .response()
        .then((response) => response?.finished())
        .catch(() => {}),
      deadline.failure,
    ]);
  } finally {
    deadline.cancel();
  }
};

export const release = async (routes: Route[]) => {
  await Promise.all(routes.map(releaseUntilDownloaded));
};

export const waitForNetworkIdle = async (
  page: Page,
  action: () => Promise<unknown>,
  quietMs = 1000
) => {
  const pending = new Set<Request>();
  let lastActivity = Date.now();
  const onRequest = (request: Request) => {
    pending.add(request);
    lastActivity = Date.now();
  };
  const onDone = (request: Request) => {
    pending.delete(request);
    lastActivity = Date.now();
  };
  page.on('request', onRequest);
  page.on('requestfinished', onDone);
  page.on('requestfailed', onDone);
  try {
    await action();
    const startedAt = Date.now();
    while (pending.size || Date.now() - lastActivity < quietMs) {
      if (Date.now() - startedAt > NETWORK_IDLE_LIMIT_MS) {
        const urls = [...pending].map((request) => request.url());
        throw new Error(`The network never went idle; still pending: ${urls.join(', ')}`);
      }
      await page.waitForTimeout(100);
    }
  } finally {
    page.off('request', onRequest);
    page.off('requestfinished', onDone);
    page.off('requestfailed', onDone);
  }
};

export const releaseAll = async (gate: Gate, ongoing: Route[] = []) => {
  gate.mode = 'pass';
  await release([...gate.held.splice(0), ...ongoing.splice(0)]);
};

export const waitForQwikloader = (page: Page) =>
  page.waitForFunction(() => (window as any)._qwikEv?.roots, null, { timeout: 15_000 });

const fixturesWithVisibleTaskInView = async (page: Page) =>
  new Set(
    await page.locator('[q-e\\:qvisible]').evaluateAll((elements) =>
      elements
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth
          );
        })
        .map((element) => element.closest<HTMLElement>('[data-fixture]')?.dataset.fixture)
    )
  );

const takeRoutes = (routes: Route[], shouldTake: (route: Route) => boolean) => {
  const taken = routes.filter(shouldTake);
  routes.splice(0, routes.length, ...routes.filter((route) => !shouldTake(route)));
  return taken;
};

const urlsOf = (routes: Route[]) => routes.map((route) => route.request().url());

export const openCold = (page: Page, gate: Gate, fixture: Fixture) =>
  openColdPage(page, gate, fixture.path, [fixture]);

export const openColdPage = async (page: Page, gate: Gate, path: string, fixtures: Fixture[]) => {
  page.once('load', () => {
    gate.mode = 'hold';
  });
  await page.goto(path);
  await waitForQwikloader(page);
  const inView = await fixturesWithVisibleTaskInView(page);
  const ownSources = fixtures.flatMap((fixture) => fixture.sources);
  const runAtLoadSources = fixtures
    .filter((fixture) => inView.has(fixture.id))
    .flatMap((fixture) => fixture.sources);
  const isOngoingCandidate = (url: string) =>
    chunkComesFrom(url, [FILLER]) ||
    (chunkComesFrom(url, ownSources) &&
      !(chunkHasVisibleTask(url) && chunkComesFrom(url, runAtLoadSources)));
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
  await waitForNetworkIdle(page, async () => {
    await page.goto(path);
    await waitForQwikloader(page);
    await page.waitForFunction(() => typeof (globalThis as any).qPreload === 'function', null, {
      timeout: 15_000,
    });
  });
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
    if (roundTrips.length === MAX_ROUND_TRIPS) {
      throw new Error(`More than ${MAX_ROUND_TRIPS} round trips`);
    }
    roundTrips.push({ urls: urlsOf(routes), ongoingUrls: urlsOf(ongoingRoutes) });
    await release(routes);
  }
};

export const resultIsDone = (result: Locator) => () =>
  result.evaluateAll((elements) =>
    elements.some((element) => element.hasAttribute('data-done') && element.checkVisibility())
  );

export const formatRoundTrips = (
  roundTrips: RoundTrip[],
  { segmentsFrom }: { segmentsFrom?: string[] } = {}
) =>
  roundTrips
    .map(({ urls }, index) => ({
      number: index + 1,
      urls: segmentsFrom ? urls.filter((url) => chunkHoldsSegmentsFrom(url, segmentsFrom)) : urls,
    }))
    .filter(({ urls }) => urls.length)
    .map(({ number, urls }) => {
      const labels = [...new Set(urls.map(labelRequest))].sort();
      return [`round trip ${number}:`, ...labels.map((label) => `  ${label}`)].join('\n');
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

export const speculativeOrder = async (page: Page) => {
  const order: string[] = [];
  for (const link of await preloaderLinks(page)) {
    if (link.speculative && order[order.length - 1] !== ownerOf(link.href)) {
      order.push(ownerOf(link.href));
    }
  }
  return order.join('\n') + '\n';
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
