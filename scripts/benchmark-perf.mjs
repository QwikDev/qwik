import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { cpus, platform, release } from 'node:os';

const options = parseOptions(process.argv.slice(2));
const browser = await chromium.launch({ headless: true });

try {
  if (options.allocations) {
    await runAllocationProfile(browser, options);
  } else {
    await runTimingBenchmark(browser, options);
  }
} finally {
  await browser.close();
}

async function runTimingBenchmark(browser, options) {
  await withBenchmarkPage(browser, async (page, session) => {
    await prepareMeasuredRun(page, options.url);
    await installFlushTimer(page);
    for (let index = 0; index < options.warmup; index++) {
      await clearRows(page);
      await measureRows(page);
    }
    const samples = [];
    for (let index = 0; index < options.samples; index++) {
      await clearRows(page);
      let duration;
      const events = await captureTrace(
        session,
        async () => {
          duration = await measureRows(page);
        },
        'blink.user_timing,v8,disabled-by-default-v8.gc'
      );
      const start = events.find((event) => event.name === 'counter-start')?.ts;
      const end = events.find((event) => event.name === 'counter-end')?.ts;
      if (start === undefined || end === undefined) {
        throw new Error('Missing timing marks.');
      }
      const gc = events.filter(
        (event) =>
          /MinorGC|MajorGC|Scavenge/i.test(event.name) &&
          event.ts < end &&
          event.ts + (event.dur ?? 0) > start
      );
      samples.push({
        duration,
        gc: gc.map((event) => ({ name: event.name, duration: (event.dur ?? 0) / 1000 })),
      });
      process.stdout.write(
        `sample ${index + 1}: ${duration.toFixed(2)} ms${gc.length ? ' GC' : ''}\n`
      );
    }
    const durations = samples.map((sample) => sample.duration).sort((left, right) => left - right);
    const summary = {
      scenario: 'visible clear → create 10,000 rows through scheduler completion',
      url: options.url,
      warmup: options.warmup,
      cleanupGc: true,
      samples,
      median: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      gcSamples: samples.filter((sample) => sample.gc.length > 0).length,
      environment: {
        node: process.version,
        chromium: browser.version(),
        playwright: JSON.parse(
          readFileSync(new URL('../node_modules/@playwright/test/package.json', import.meta.url))
        ).version,
        platform: platform(),
        release: release(),
        cpu: cpus()[0]?.model,
        runner: process.env.RUNNER_OS ?? 'local',
        image: process.env.ImageOS ?? null,
        viewport: { width: 1280, height: 720 },
      },
    };
    mkdirSync(dirname(options.output), { recursive: true });
    writeFileSync(options.output, JSON.stringify(summary, null, 2) + '\n');
    process.stdout.write(JSON.stringify({ ...summary, samples: samples.length }, null, 2) + '\n');
    let budget = options.p50;
    if (options.budget !== undefined) {
      const calibration = JSON.parse(readFileSync(options.budget, 'utf8'));
      if (
        calibration.cleanupGc !== true ||
        calibration.medians?.length !== 5 ||
        !calibration.medians.every((value) => Number.isFinite(value) && value > 0)
      ) {
        throw new Error(
          'The performance budget requires five successful runner calibration medians.'
        );
      }
      if (
        calibration.environment.node !== summary.environment.node ||
        calibration.environment.chromium !== summary.environment.chromium ||
        calibration.environment.platform !== summary.environment.platform ||
        calibration.environment.playwright !== summary.environment.playwright ||
        calibration.environment.runner !== summary.environment.runner ||
        calibration.environment.image !== summary.environment.image
      ) {
        throw new Error('Performance calibration environment does not match this run.');
      }
      budget = Math.max(...calibration.medians) * 1.5;
    }
    if (!options.noFail && summary.median > budget) {
      await clearRows(page);
      await session.send('Profiler.enable');
      await session.send('Profiler.start');
      await measureRows(page);
      const { profile } = await session.send('Profiler.stop');
      writeFileSync(options.output.replace(/\.json$/, '') + '.cpuprofile', JSON.stringify(profile));
      console.error(`Median ${summary.median.toFixed(2)} ms exceeds ${budget.toFixed(2)} ms.`);
      process.exitCode = 1;
    }
  });
}

async function installFlushTimer(page) {
  await page.evaluate(() => {
    const scheduler = document.querySelector('[q\\:container]')._ctx.scheduler;
    const original = scheduler.flushInteraction;
    scheduler.flushInteraction = function () {
      const measured = window.counterMeasurement;
      const flushing = original.call(this);
      if (measured !== undefined) {
        flushing.then(() => {
          if (window.counterMeasurement !== measured) {
            return;
          }
          const duration = performance.now() - measured.start;
          performance.mark('counter-end');
          window.counterMeasurement = undefined;
          measured.resolve(duration);
        }, measured.reject);
      }
      return flushing;
    };
  });
}

async function measureRows(page) {
  const duration = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const table = document.querySelector('table');
        if (
          !table.isConnected ||
          !table.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        ) {
          reject(new Error('The measured table must be visible.'));
          return;
        }
        const timeout = setTimeout(() => reject(new Error('Scheduler flush timed out.')), 120_000);
        const measured = {
          start: 0,
          resolve(duration) {
            clearTimeout(timeout);
            resolve(duration);
          },
          reject(error) {
            clearTimeout(timeout);
            reject(error);
          },
        };
        performance.clearMarks('counter-start');
        performance.clearMarks('counter-end');
        performance.mark('counter-start');
        measured.start = performance.now();
        window.counterMeasurement = measured;
        document.querySelector('#runlots').click();
      })
  );
  const complete = await page.evaluate(() => {
    const rows = document.querySelectorAll('tbody > tr');
    return (
      rows.length === 10_000 &&
      [...rows].every(
        (row) =>
          row.children.length === 4 &&
          /^\d+$/.test(row.children[0].textContent) &&
          row.children[1].textContent.trim().length > 0
      )
    );
  });
  if (!complete) {
    throw new Error('Scheduler completed before all 10,000 rows were written.');
  }
  return duration;
}

async function runAllocationProfile(browser, options) {
  await withBenchmarkPage(browser, async (page, session) => {
    await prepareMeasuredRun(page, options.url);
    await session.send('HeapProfiler.enable');
    await session.send('HeapProfiler.startSampling', { samplingInterval: 32768 });
    const heapBefore = await session.send('Runtime.getHeapUsage');
    const domBefore = await session.send('Memory.getDOMCounters');
    const trace = await captureTrace(session, () => createRows(page));
    const { profile } = await session.send('HeapProfiler.stopSampling');
    const heapAfter = await session.send('Runtime.getHeapUsage');
    const domAfter = await session.send('Memory.getDOMCounters');
    await session.send('HeapProfiler.collectGarbage');
    const heapRetained = await session.send('Runtime.getHeapUsage');
    const domRetained = await session.send('Memory.getDOMCounters');
    const timing = analyzeTrace(trace);

    process.stdout.write(
      JSON.stringify(
        {
          url: options.url,
          scenario:
            'create 10,000 keyed rows after a 10,000 row run and clear with allocation sampling',
          eventDispatch: timing.duration,
          minorGc: timing.minorGc,
          heap: {
            before: heapBefore.usedSize,
            after: heapAfter.usedSize,
            afterForcedGc: heapRetained.usedSize,
          },
          dom: {
            before: domBefore,
            after: domAfter,
            afterForcedGc: domRetained,
          },
          sampledAllocations: summarizeAllocations(profile),
        },
        null,
        2
      )
    );
  });
}

async function withBenchmarkPage(browser, run) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  const session = await context.newCDPSession(page);
  try {
    return await run(page, session);
  } finally {
    await context.close();
  }
}

async function prepareMeasuredRun(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('#runlots').waitFor();
  await clearRows(page, false);
  await createRows(page);
  await clearRows(page);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      })
  );
}

async function createRows(page) {
  await page.locator('#runlots').click();
  await page.waitForFunction(
    () => document.querySelector('tbody')?.childElementCount === 10_000,
    undefined,
    { timeout: 120_000 }
  );
  await settleScheduler(page);
}

async function clearRows(page, teardown = true) {
  const cleanupSession = await page.context().newCDPSession(page);
  await cleanupSession.send('HeapProfiler.collectGarbage');
  await cleanupSession.detach();
  await page.evaluate((teardown) => {
    const table = document.querySelector('table');
    window.counterTable = { table, parent: table.parentNode, next: table.nextSibling };
    // Untimed cleanup avoids quadratic disposal of obsolete content ranges.
    if (teardown) {
      const walker = document.createTreeWalker(table, NodeFilter.SHOW_COMMENT);
      const markers = [];
      while (walker.nextNode()) {
        if (walker.currentNode.parentElement?.closest('tr')) {
          markers.push(walker.currentNode);
        }
      }
      for (const marker of markers) {
        marker.remove();
      }
      table.remove();
    }
    if (teardown) {
      document.querySelector('#clear').click();
    }
  }, teardown);
  if (!teardown) {
    await page.locator('#clear').click();
  }
  try {
    await page.waitForFunction(
      () => window.counterTable.table.querySelector('tbody')?.childElementCount === 0,
      undefined,
      { timeout: 120_000 }
    );
    await settleScheduler(page);
  } finally {
    await page.evaluate(() => {
      const { table, parent, next } = window.counterTable;
      parent.insertBefore(table, next);
      delete window.counterTable;
    });
  }
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
}

async function settleScheduler(page) {
  await page.evaluate(() =>
    document.querySelector('[q\\:container]')._ctx.scheduler.flushInteraction()
  );
}

async function captureTrace(session, action, categories) {
  await session.send('Tracing.start', {
    categories:
      categories ??
      ['devtools.timeline', 'v8', 'v8.execute', 'disabled-by-default-v8.gc'].join(','),
    transferMode: 'ReturnAsStream',
  });
  await action();
  const completed = new Promise((resolve) => {
    session.once('Tracing.tracingComplete', resolve);
  });
  await session.send('Tracing.end');
  const { stream } = await completed;
  let json = '';
  while (true) {
    const chunk = await session.send('IO.read', { handle: stream });
    json += chunk.data;
    if (chunk.eof) {
      break;
    }
  }
  await session.send('IO.close', { handle: stream });
  return JSON.parse(json).traceEvents;
}

function analyzeTrace(events) {
  const dispatches = events.filter(
    (event) =>
      event.name === 'EventDispatch' &&
      event.ph === 'X' &&
      event.dur > 0 &&
      event.args?.data?.type === 'click'
  );
  const dispatch = dispatches.sort((left, right) => right.dur - left.dur)[0];
  if (dispatch === undefined) {
    throw new Error('The trace does not contain a click EventDispatch.');
  }
  const start = dispatch.ts;
  const end = dispatch.ts + dispatch.dur;
  const nested = events.filter(
    (event) =>
      event.ph === 'X' &&
      event.dur > 0 &&
      event.name !== 'EventDispatch' &&
      event.ts >= start &&
      event.ts + event.dur <= end
  );
  const totals = new Map();
  for (const event of nested) {
    totals.set(event.name, (totals.get(event.name) ?? 0) + event.dur / 1000);
  }
  const minorGc = events.some(
    (event) =>
      /MinorGC|Scavenge/i.test(event.name) && event.ts < end && event.ts + (event.dur ?? 0) > start
  );
  return {
    duration: dispatch.dur / 1000,
    minorGc,
    events: [...totals].sort((left, right) => right[1] - left[1]).slice(0, 20),
  };
}

function summarizeAllocations(profile) {
  const nodes = new Map();
  const visit = (node) => {
    nodes.set(node.id, node);
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  visit(profile.head);
  const totals = new Map();
  for (const sample of profile.samples ?? []) {
    const frame = nodes.get(sample.nodeId)?.callFrame;
    const name = frame
      ? `${frame.functionName || '(anonymous)'} ${frame.url || ''}`.trim()
      : '(unknown)';
    totals.set(name, (totals.get(name) ?? 0) + sample.size);
  }
  return [...totals]
    .map(([name, bytes]) => ({ name, bytes }))
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, 20);
}

function percentile(values, ratio) {
  if (ratio === 0.5 && values.length % 2 === 0) {
    return (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
  }
  return values[Math.max(0, Math.ceil(values.length * ratio) - 1)];
}

function parseOptions(args) {
  const values = new Map(
    args.map((arg) => {
      const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
      return [key, value];
    })
  );
  const options = {
    url: values.get('url') ?? 'http://localhost:3300/perf.prod/',
    warmup: Number(values.get('warmup') ?? 10),
    samples: Number(values.get('samples') ?? 30),
    p50: Number(values.get('p50') ?? Infinity),
    output: values.get('output') ?? 'test-results/performance.json',
    budget: values.get('budget'),
    allocations: values.has('allocations'),
    noFail: values.has('no-fail'),
  };
  if (
    !Number.isInteger(options.warmup) ||
    options.warmup < 0 ||
    !Number.isInteger(options.samples) ||
    options.samples < 1 ||
    !(options.p50 > 0)
  ) {
    throw new Error('Warmup, samples and median budget must be positive valid numbers.');
  }
  return options;
}
