import type { Browser, Page } from '@playwright/test';

const LONG_TASK_MS = 50;
const MID_TIER_PHONE_INDEX = 400;
const SLOW_NETWORK = {
  offline: false,
  latency: 40,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};

// Adapted from Lighthouse's computeBenchmarkIndex (core/lib/page-functions.js, Apache-2.0).
const computeBenchmarkIndex = () => {
  const benchmarkIndexGC = () => {
    const start = Date.now();
    let iterations = 0;
    while (Date.now() - start < 500) {
      let s = '';
      for (let j = 0; j < 10000; j++) {
        s += 'a';
      }
      if (s.length === 1) {
        throw new Error('unreachable');
      }
      iterations++;
    }
    return Math.round(iterations / 10 / ((Date.now() - start) / 1000));
  };
  const benchmarkIndexNoGC = () => {
    const arrA: number[] = [];
    const arrB: number[] = [];
    for (let i = 0; i < 100000; i++) {
      arrA[i] = arrB[i] = i;
    }
    const start = Date.now();
    let iterations = 0;
    while (iterations % 10 !== 0 || Date.now() - start < 500) {
      const src = iterations % 2 === 0 ? arrA : arrB;
      const tgt = iterations % 2 === 0 ? arrB : arrA;
      for (let j = 0; j < src.length; j++) {
        tgt[j] = src[j];
      }
      iterations++;
    }
    return Math.round(iterations / 10 / ((Date.now() - start) / 1000));
  };
  return (benchmarkIndexGC() + benchmarkIndexNoGC()) / 2;
};

const measureCpuRate = async (page: Page) => {
  const indexes: number[] = [];
  for (let i = 0; i < 3; i++) {
    indexes.push(await page.evaluate(computeBenchmarkIndex));
  }
  const median = indexes.sort((a, b) => a - b)[1];
  return Math.max(1, median / MID_TIER_PHONE_INDEX);
};

export const throttleLikeAMidTierPhone = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);
  await page.goto('about:blank');
  const cpuRate = await measureCpuRate(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', SLOW_NETWORK);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  return cpuRate;
};

type TraceEvent = {
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: { name?: string; fileName?: string; data?: { url?: string; fileName?: string } };
};

export type LongTask = {
  durationMs: number;
  preloaderMs: number;
  scripts: string[];
};

const SCRIPT_EVENTS = new Set([
  'FunctionCall',
  'EvaluateScript',
  'v8.compile',
  'v8.compileModule',
  'v8.evaluateModule',
]);

const urlOf = (event: TraceEvent) =>
  event.args?.data?.url ?? event.args?.fileName ?? event.args?.data?.fileName ?? '';

const mergedDuration = (intervals: [number, number][]) => {
  let total = 0;
  let end = -Infinity;
  for (const [from, to] of intervals.sort((a, b) => a[0] - b[0])) {
    if (to > end) {
      total += to - Math.max(from, end);
      end = to;
    }
  }
  return total;
};

const findRendererMainThread = (events: TraceEvent[]) => {
  const candidates = events.filter(
    (event) => event.name === 'thread_name' && event.args?.name === 'CrRendererMain'
  );
  let best: TraceEvent | undefined;
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = events.filter(
      (event) =>
        event.pid === candidate.pid && event.tid === candidate.tid && event.name === 'RunTask'
    ).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
};

export const findLongTasks = (
  events: TraceEvent[],
  preloaderUrl: string,
  preloadedUrls: Set<string>
): LongTask[] => {
  const main = findRendererMainThread(events);
  if (!main) {
    throw new Error('The trace has no renderer main thread to measure');
  }
  const onMain = events.filter(
    (event) => event.pid === main.pid && event.tid === main.tid && event.ph === 'X' && event.dur
  );
  return onMain
    .filter((event) => event.name === 'RunTask' && event.dur! >= LONG_TASK_MS * 1000)
    .map((task) => {
      const scripts = onMain.filter(
        (event) =>
          SCRIPT_EVENTS.has(event.name) &&
          event.ts >= task.ts &&
          event.ts + event.dur! <= task.ts + task.dur!
      );
      const isPreloaderWork = (event: TraceEvent) =>
        urlOf(event) === preloaderUrl ||
        (event.name.startsWith('v8.compile') && preloadedUrls.has(urlOf(event)));
      const preloaderWork = scripts
        .filter(isPreloaderWork)
        .map((event) => [event.ts, event.ts + event.dur!] as [number, number]);
      return {
        durationMs: Math.round(task.dur! / 1000),
        preloaderMs: Math.round(mergedDuration(preloaderWork) / 1000),
        scripts: [
          ...new Set(scripts.map((event) => `${event.name} ${urlOf(event).split('/').pop()}`)),
        ],
      };
    });
};

export const longTasksFromThePreloader = (tasks: LongTask[]) =>
  tasks.filter(
    (task) =>
      task.preloaderMs >= LONG_TASK_MS ||
      (task.preloaderMs > 0 && task.durationMs - task.preloaderMs < LONG_TASK_MS)
  );

export const traceLongTasks = async (
  browser: Browser,
  page: Page,
  run: () => Promise<void>,
  preloaderUrl: () => string,
  preloadedUrls: () => Promise<Set<string>>
) => {
  await browser.startTracing(page, {
    categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'v8.execute'],
  });
  await run();
  const trace = JSON.parse((await browser.stopTracing()).toString());
  return findLongTasks(trace.traceEvents ?? trace, preloaderUrl(), await preloadedUrls());
};
