import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { cpus } from 'node:os';

const { values } = parseArgs({
  options: {
    'benchmark-dir': { type: 'string' },
    url: { type: 'string', default: 'http://localhost:3300/perf.prod/' },
    samples: { type: 'string', default: '20' },
    output: { type: 'string', default: 'test-results/partial-update.json' },
  },
});
const samples = Number(values.samples);
if (!values['benchmark-dir'] || !Number.isInteger(samples) || samples < 1) {
  throw new Error(
    'Provide --benchmark-dir=<js-framework-benchmark checkout> and positive --samples.'
  );
}
const benchmarkDir = realpathSync(values['benchmark-dir']);
const cssFiles = ['css/bootstrap/dist/css/bootstrap.min.css', 'css/main.css'];
const hash = (path) =>
  createHash('sha256')
    .update(readFileSync(resolve(benchmarkDir, path)))
    .digest('hex');
const solidVersion = JSON.parse(
  readFileSync(resolve(benchmarkDir, 'frameworks/keyed/solid/package-lock.json'), 'utf8')
).packages['node_modules/solid-js'].version;
const installedVersion = JSON.parse(
  readFileSync(
    resolve(benchmarkDir, 'frameworks/keyed/solid/node_modules/solid-js/package.json'),
    'utf8'
  )
).version;
if (installedVersion !== solidVersion) {
  throw new Error('Run npm ci and rebuild Solid: its installed version differs from its lockfile.');
}
const css = Object.fromEntries(cssFiles.map((path) => [path, hash(path)]));
const solidBundle = hash('frameworks/keyed/solid/dist/main.js');
const iconFont = hash('css/bootstrap/dist/fonts/glyphicons-halflings-regular.woff2');
mkdirSync(dirname(values.output), { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = {
  environment: { node: process.version, chromium: browser.version(), cpu: cpus()[0]?.model },
  viewport: { width: 1280, height: 800 },
  css,
  solidBundle,
  url: values.url,
  solidVersion,
  iconFont,
  complete: false,
  samples: [],
};
try {
  for (let round = 0; round < samples; round++) {
    const frameworks = ['solid', 'qwik-csr', 'qwik-resume'];
    if (round % 2) {
      frameworks.reverse();
    }
    for (const framework of frameworks) {
      for (const scenario of ['partial-update', 'create-1000', 'create-10000']) {
        const context = await browser.newContext({ viewport: report.viewport });
        try {
          const page = await context.newPage();
          page.setDefaultTimeout(120_000);
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await context.route('http://benchmark.test/**', async (route) => {
            const pathname = new URL(route.request().url()).pathname;
            const path = realpathSync(resolve(benchmarkDir, '.' + decodeURIComponent(pathname)));
            if (
              !path.startsWith(benchmarkDir + sep) ||
              !(pathname.startsWith('/css/') || pathname.startsWith('/frameworks/keyed/solid/'))
            ) {
              throw new Error(`Unexpected benchmark asset: ${pathname}`);
            }
            await route.fulfill({ path, headers: { 'Access-Control-Allow-Origin': '*' } });
          });
          const url = new URL(values.url);
          url.searchParams.delete('csr');
          if (framework === 'qwik-csr') {
            url.searchParams.set('csr', '1');
          }
          await page.goto(
            framework === 'solid'
              ? 'http://benchmark.test/frameworks/keyed/solid/index.html'
              : url.href,
            { waitUntil: 'networkidle' }
          );
          if (framework !== 'solid') {
            for (const path of cssFiles) {
              await page.addStyleTag({ url: `http://benchmark.test/${path}` });
            }
          }
          await page.evaluate(() => document.fonts.ready);
          const styled = await page.evaluate(
            () =>
              getComputedStyle(document.querySelector('.btn')).display === 'block' &&
              [...document.fonts].some(
                (font) => font.family.includes('Glyphicons') && font.status === 'loaded'
              )
          );
          if (!styled) {
            throw new Error('The benchmark CSS and icon font must be loaded.');
          }
          if (framework === 'qwik-resume' && scenario !== 'partial-update') {
            await page.locator('#clear').click();
            await page.waitForFunction(() => document.querySelectorAll('tbody > tr').length === 0);
          }
          for (let warmup = 0; warmup < (scenario === 'partial-update' ? 1 : 5); warmup++) {
            if (framework === 'qwik-resume' && scenario === 'partial-update') {
              break;
            }
            await page.locator('#run').click();
            await page.waitForFunction(
              () => document.querySelectorAll('tbody > tr').length === 1000
            );
            if (scenario !== 'partial-update') {
              await page.locator('#clear').click();
              await page.waitForFunction(
                () => document.querySelectorAll('tbody > tr').length === 0
              );
            }
          }
          if (scenario === 'partial-update') {
            for (let warmup = 1; warmup <= 3; warmup++) {
              await page.locator('#update').click();
              await page.waitForFunction(
                (count) =>
                  document
                    .querySelector('tbody > tr > td:nth-child(2)')
                    .textContent.endsWith(' !!!'.repeat(count)),
                warmup
              );
            }
          }
          await page.evaluate(
            () =>
              new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          );
          const session = await context.newCDPSession(page);
          await session.send('HeapProfiler.collectGarbage');
          const throttle = scenario === 'partial-update' ? 4 : 1;
          await session.send('Emulation.setCPUThrottlingRate', { rate: throttle });
          await session.send('Tracing.start', {
            categories: 'blink.user_timing,devtools.timeline,disabled-by-default-devtools.timeline',
            transferMode: 'ReturnAsStream',
          });
          await page
            .locator(
              scenario === 'partial-update'
                ? '#update'
                : scenario === 'create-1000'
                  ? '#run'
                  : '#runlots'
            )
            .click();
          await page.waitForFunction(
            ({ scenario }) =>
              scenario === 'partial-update'
                ? document
                    .querySelector('tbody > tr:nth-child(991) > td:nth-child(2)')
                    .textContent.endsWith(' !!!'.repeat(4))
                : document.querySelectorAll('tbody > tr').length ===
                  (scenario === 'create-1000' ? 1000 : 10000),
            { scenario }
          );
          // Wait for layout and paint before ending the trace.
          await page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0)))
              )
          );
          await page.waitForTimeout(80);
          const completed = new Promise((resolve) =>
            session.once('Tracing.tracingComplete', resolve)
          );
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
          const events = JSON.parse(json).traceEvents;
          const click = events.find(
            (event) => event.name === 'EventDispatch' && event.args?.data?.type === 'click'
          );
          if (!click) {
            throw new Error('Missing measured click.');
          }
          const main = events.filter(
            (event) =>
              event.ph === 'X' &&
              event.pid === click.pid &&
              event.tid === click.tid &&
              event.ts >= click.ts
          );
          const layout = main.filter((event) => event.name === 'Layout').at(-1);
          const commit =
            layout &&
            main.find((event) => event.name === 'Commit' && event.ts >= layout.ts + layout.dur);
          if (!commit) {
            writeFileSync(values.output + '.trace.json', json);
            throw new Error('Missing layout/compositor commit.');
          }
          let end = click.ts;
          let script = 0;
          for (const event of main
            .filter(
              (event) =>
                [
                  'EventDispatch',
                  'FunctionCall',
                  'RunMicrotasks',
                  'TimerFire',
                  'FireAnimationFrame',
                ].includes(event.name) && event.ts < commit.ts
            )
            .sort((left, right) => left.ts - right.ts)) {
            const eventEnd = Math.min(event.ts + event.dur, commit.ts);
            script += Math.max(0, eventEnd - Math.max(end, event.ts));
            end = Math.max(end, eventEnd);
          }
          const valid = await page.evaluate(
            ({ scenario }) => {
              const rows = [...document.querySelectorAll('tbody > tr')];
              return (
                rows.length === (scenario === 'create-10000' ? 10000 : 1000) &&
                rows.every((row, index) => {
                  if (row.children.length !== 4 || !/^\d+$/.test(row.children[0].textContent)) {
                    return false;
                  }
                  const label = row.children[1].textContent;
                  if (scenario !== 'partial-update') {
                    return label.trim().length > 0;
                  }
                  if (index % 10 !== 0) {
                    return !label.includes('!!!');
                  }
                  return label.endsWith(' !!!'.repeat(4)) && label.split(' !!!').length === 5;
                })
              );
            },
            { scenario }
          );
          if (!valid || errors.length) {
            throw new Error(`Invalid benchmark output: ${errors.join('; ')}`);
          }
          const sample = {
            framework,
            scenario,
            round,
            firstRowId: await page.locator('tbody > tr > td:first-child').first().textContent(),
            throttle,
            total: (commit.ts + commit.dur - click.ts) / 1000,
            script: script / 1000,
            layout: main
              .filter((event) => event.name === 'Layout')
              .reduce((sum, event) => sum + event.dur / 1000, 0),
          };
          report.samples.push(sample);
          console.log(JSON.stringify(sample));
        } finally {
          await context.close();
        }
      }
    }
  }
  report.complete = true;
} finally {
  writeFileSync(values.output, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
for (const framework of ['solid', 'qwik-csr', 'qwik-resume']) {
  for (const scenario of ['partial-update', 'create-1000', 'create-10000']) {
    const measured = report.samples.filter(
      (sample) => sample.framework === framework && sample.scenario === scenario
    );
    const median = (key) => {
      const sorted = measured.map((sample) => sample[key]).sort((left, right) => left - right);
      return (
        (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2
      );
    };
    console.log(
      `${framework} ${scenario}: total ${median('total').toFixed(2)} ms, script ${median('script').toFixed(2)} ms`
    );
  }
}
