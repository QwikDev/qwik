import type { Locator, Page, Request, Route } from '@playwright/test';
import { bundleFile, chunkHoldsSegmentsFrom, labelRequest, neededWith, ORIGIN } from './app';

export const FILLER = 'src/components/filler/';

const QUIET_MS = 250;
const MAX_ROUND_TRIPS = 20;
const DOWNLOAD_LIMIT_MS = 30_000;
const NETWORK_IDLE_LIMIT_MS = 60_000;

export type Gate = {
  page: Page;
  mode: 'pass' | 'hold';
  held: Route[];
  holdWhilePassing?: (url: string) => boolean;
};

export type RoundTrip = {
  urls: string[];
};

export type PreloaderLink = { href: string; speculative: boolean };

type PreloaderWindow = Window & {
  __preloaderLinks?: PreloaderLink[];
  __speculativeInFlight?: number;
  __maxSpeculativeInFlight?: number;
  __holdsSpeculativePreloads?: boolean;
  __heldSpeculativePreloads?: number;
  __resumeSpeculativePreloads?: () => void;
  __sendHeldSpeculativePreloads?: (hrefs: string[]) => void;
  __preloadHints?: PreloadHint[];
};

export type PreloadHint = { item: string | string[]; probability?: number };

export const recordPreloadHints = (page: Page) =>
  page.addInitScript(() => {
    const win = window as PreloaderWindow;
    const hints: PreloadHint[] = (win.__preloadHints = []);
    let preload: ((item: string | string[], probability?: number) => void) | undefined;
    Object.defineProperty(win, 'qPreload', {
      configurable: true,
      get: () =>
        preload &&
        ((item: string | string[], probability?: number) => {
          hints.push({ item, probability });
          preload!(item, probability);
        }),
      set: (value) => {
        preload = value;
      },
    });
  });

export const preloadHints = (page: Page) =>
  page.evaluate(() => (window as PreloaderWindow).__preloadHints ?? []);

export const recordSpeculativePreloads = (page: Page) =>
  page.addInitScript(() => {
    const win = window as PreloaderWindow;
    win.__preloaderLinks = [];
    win.__speculativeInFlight = 0;
    win.__maxSpeculativeInFlight = 0;
    const heldLinks: [Node, HTMLLinkElement][] = [];
    const appendChild = Node.prototype.appendChild;
    win.__sendHeldSpeculativePreloads = (hrefs) => {
      for (let i = heldLinks.length - 1; i >= 0; i--) {
        const [parent, link] = heldLinks[i];
        if (hrefs.includes(link.href)) {
          heldLinks.splice(i, 1);
          appendChild.call(parent, link);
        }
      }
    };
    win.__resumeSpeculativePreloads = () => {
      win.__holdsSpeculativePreloads = false;
      for (const [parent, link] of heldLinks.splice(0)) {
        appendChild.call(parent, link);
      }
    };
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
          if (win.__holdsSpeculativePreloads) {
            heldLinks.push([this, node]);
            win.__heldSpeculativePreloads = heldLinks.length;
            return node;
          }
        }
      }
      return appendChild.call(this, node) as T;
    };
  });

export const holdSpeculativePreloads = (page: Page) =>
  page.addInitScript(() => {
    (window as PreloaderWindow).__holdsSpeculativePreloads = true;
  });

/**
 * The preloader counts a held speculative preload as in flight, so it never requests that chunk
 * again once it is needed. Send it when a request makes it needed, as the preloader would.
 */
const sendHeldPreloadsNeededWith = (page: Page, url: string) => {
  if (!url.startsWith(`${ORIGIN}/build/`)) {
    return;
  }
  const hrefs = [...neededWith(bundleFile(url))].map((bundle) => `${ORIGIN}/build/${bundle}`);
  page
    .evaluate((hrefs) => (window as PreloaderWindow).__sendHeldSpeculativePreloads?.(hrefs), hrefs)
    .catch(() => {});
};

const resumeSpeculativePreloads = (page: Page) =>
  page.evaluate(() => (window as PreloaderWindow).__resumeSpeculativePreloads?.());

export const maxSpeculativeInFlight = (page: Page) =>
  page.evaluate(() => (window as PreloaderWindow).__maxSpeculativeInFlight ?? 0);

export const preloaderLinks = (page: Page) =>
  page.evaluate(() => (window as PreloaderWindow).__preloaderLinks ?? []);

export const speculativePreloads = async (page: Page) =>
  new Set((await preloaderLinks(page)).filter((link) => link.speculative).map((link) => link.href));

export const createGate = async (page: Page): Promise<Gate> => {
  const gate: Gate = { page, mode: 'pass', held: [] };
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
    if (gate.mode === 'hold') {
      sendHeldPreloadsNeededWith(page, request.url());
    }
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

export const releaseAll = async (gate: Gate, heldBack: Route[] = []) => {
  gate.mode = 'pass';
  await resumeSpeculativePreloads(gate.page);
  await release([...gate.held.splice(0), ...heldBack.splice(0)]);
};

export const waitForQwikloader = (page: Page) =>
  page.waitForFunction(() => (window as any)._qwikEv?.roots, null, { timeout: 15_000 });

const urlsOf = (routes: Route[]) => routes.map((route) => route.request().url());

export const openCold = async (page: Page, gate: Gate, path: string) => {
  await holdSpeculativePreloads(page);
  await waitForNetworkIdle(page, async () => {
    await page.goto(path);
    await waitForQwikloader(page);
    await page.waitForFunction(() => (window as PreloaderWindow).__heldSpeculativePreloads, null, {
      timeout: 15_000,
    });
  });
  gate.mode = 'hold';
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
  heldBack: Route[] = []
) => {
  gate.mode = 'hold';
  await action();
  const roundTrips: RoundTrip[] = [];
  for (;;) {
    await settle(page, gate);
    if (await isDone()) {
      return roundTrips;
    }
    const routes = gate.held.length ? gate.held.splice(0) : heldBack.splice(0);
    if (!routes.length) {
      throw new Error(`Not done and nothing requested after ${roundTrips.length} round trips`);
    }
    if (roundTrips.length === MAX_ROUND_TRIPS) {
      throw new Error(`More than ${MAX_ROUND_TRIPS} round trips`);
    }
    roundTrips.push({ urls: urlsOf(routes) });
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
