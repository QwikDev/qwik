import { chromium } from '@playwright/test';

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
  for (let i = 0; i < options.warmup; i++) {
    await withBenchmarkPage(browser, async (page) => {
      await prepareMeasuredRun(page, options.url);
      await createRows(page);
    });
  }

  const samples = [];
  const dominantEvents = new Map();
  for (let i = 0; i < options.samples; i++) {
    const trace = await withBenchmarkPage(browser, async (page, session) => {
      await prepareMeasuredRun(page, options.url);
      return captureTrace(session, () => createRows(page));
    });
    const result = analyzeTrace(trace);
    samples.push(result);
    for (const [name, duration] of result.events) {
      dominantEvents.set(name, (dominantEvents.get(name) ?? 0) + duration);
    }
    process.stdout.write(
      `sample ${String(i + 1).padStart(2, '0')}: ${result.duration.toFixed(2)} ms` +
        `${result.minorGc ? ' MinorGC' : ''}\n`
    );
  }

  const durations = samples.map((sample) => sample.duration).sort((a, b) => a - b);
  const summary = {
    url: options.url,
    scenario: 'create 10,000 keyed rows after a 10,000 row run and clear',
    samples: durations.length,
    min: durations[0],
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    max: durations.at(-1),
    minorGcSamples: samples.filter((sample) => sample.minorGc).length,
    dominantEvents: [...dominantEvents]
      .map(([name, duration]) => ({
        name,
        averageDuration: duration / samples.length,
      }))
      .sort((left, right) => right.averageDuration - left.averageDuration)
      .slice(0, 10),
  };

  console.log(JSON.stringify(summary, null, 2));
  if (
    !options.noFail &&
    (summary.p50 > options.p50 || summary.p95 > options.p95 || summary.minorGcSamples > 0)
  ) {
    process.exitCode = 1;
  }
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

    console.log(
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
}

async function clearRows(page) {
  await page.locator('#clear').click();
  await page.waitForFunction(
    () => document.querySelector('tbody')?.childElementCount === 0,
    undefined,
    { timeout: 120_000 }
  );
}

async function captureTrace(session, action) {
  await session.send('Tracing.start', {
    categories: ['devtools.timeline', 'v8', 'v8.execute', 'disabled-by-default-v8.gc'].join(','),
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
  return values[Math.max(0, Math.ceil(values.length * ratio) - 1)];
}

function parseOptions(args) {
  const values = new Map(
    args.map((arg) => {
      const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
      return [key, value];
    })
  );
  return {
    url: values.get('url') ?? 'http://localhost:3300/vdomless-counter.prod/',
    warmup: Number(values.get('warmup') ?? 5),
    samples: Number(values.get('samples') ?? 30),
    p50: Number(values.get('p50') ?? 16),
    p95: Number(values.get('p95') ?? 18),
    allocations: values.has('allocations'),
    noFail: values.has('no-fail'),
  };
}
